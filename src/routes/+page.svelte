<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  
  let currentUser = null;
  let currentScreen = 'userSelect';
  let currentCardIndex = 0;
  let todayAnswers = {};
  let swipeStartX = 0;
  let swipeCurrentX = 0;
  let isDragging = false;
  let showConfetti = false;
  
  let users = [];
  let habits = [];
  let userHistory = [];
  let otherUserData = null;
  let stats = { thisMonth: 0, thisYear: 0, streak: 0 };
  let loading = true;

  $: currentHabit = habits[currentCardIndex];
  $: currentAnswer = todayAnswers[currentHabit?.id];
  $: completedToday = Object.values(todayAnswers).filter(Boolean).length;
  $: totalToday = habits.length;
  $: percentage = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;
  $: otherUser = currentUser ? users.find(u => u.id !== currentUser.id) : null;

  onMount(async () => {
    await loadUsers();
    loading = false;
  });

  async function loadUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('id');
    
    if (error) {
      console.error('Error loading users:', error);
    } else {
      users = data || [];
    }
  }

  async function loadHabits(userId) {
    const { data, error } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', userId)
      .order('id');
    
    if (error) {
      console.error('Error loading habits:', error);
    } else {
      habits = data || [];
    }
  }

  async function loadTodayAnswers(userId) {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today);
    
    if (error) {
      console.error('Error loading today answers:', error);
    } else {
      todayAnswers = {};
      data?.forEach(log => {
        todayAnswers[log.habit_id] = log.completed;
      });
    }
  }

  async function loadHistory(userId) {
    const { data, error } = await supabase
      .from('habit_logs')
      .select('date, completed')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(30);
    
    if (error) {
      console.error('Error loading history:', error);
      return;
    }

    // Gruppiere nach Datum und zähle Punkte
    const grouped = {};
    data?.forEach(log => {
      if (!grouped[log.date]) grouped[log.date] = 0;
      if (log.completed) grouped[log.date]++;
    });

    userHistory = Object.entries(grouped)
      .map(([date, points]) => ({ date, points }))
      .slice(0, 7);
  }

  async function loadStats(userId) {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const thisYearStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];

    // Monatspunkte
    const { data: monthData } = await supabase
      .from('habit_logs')
      .select('completed')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('date', thisMonthStart);

    // Jahrespunkte
    const { data: yearData } = await supabase
      .from('habit_logs')
      .select('completed')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('date', thisYearStart);

    // Streak berechnen
    const { data: allDates } = await supabase
      .from('habit_logs')
      .select('date, completed')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    let streak = 0;
    const dateGroups = {};
    allDates?.forEach(log => {
      if (!dateGroups[log.date]) dateGroups[log.date] = [];
      dateGroups[log.date].push(log.completed);
    });

    const sortedDates = Object.keys(dateGroups).sort().reverse();
    for (let date of sortedDates) {
      const hasAnyCompleted = dateGroups[date].some(c => c);
      if (hasAnyCompleted) {
        streak++;
      } else {
        break;
      }
    }

    stats = {
      thisMonth: monthData?.length || 0,
      thisYear: yearData?.length || 0,
      streak
    };
  }

  async function loadOtherUserData(otherUserId) {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('habit_logs')
      .select('completed')
      .eq('user_id', otherUserId)
      .eq('date', today);
    
    if (error) {
      console.error('Error loading other user data:', error);
      return;
    }

    const completed = data?.filter(log => log.completed).length || 0;
    const total = data?.length || 0;
    
    otherUserData = {
      completed,
      total: total || 4,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }

  async function selectUser(user) {
    currentUser = user;
    loading = true;
    
    await Promise.all([
      loadHabits(user.id),
      loadTodayAnswers(user.id),
      loadStats(user.id)
    ]);
    
    currentScreen = 'dailyHabits';
    loading = false;
  }

  async function handleAnswer(answer) {
    todayAnswers[currentHabit.id] = answer;
    todayAnswers = todayAnswers;

    const today = new Date().toISOString().split('T')[0];

    // Prüfe ob schon ein Eintrag existiert
    const { data: existing } = await supabase
      .from('habit_logs')
      .select('id')
      .eq('habit_id', currentHabit.id)
      .eq('user_id', currentUser.id)
      .eq('date', today)
      .single();

    if (existing) {
      // Update
      await supabase
        .from('habit_logs')
        .update({ completed: answer })
        .eq('id', existing.id);
    } else {
      // Insert
      await supabase
        .from('habit_logs')
        .insert({
          habit_id: currentHabit.id,
          user_id: currentUser.id,
          date: today,
          completed: answer
        });
    }
  }

  async function goToNextCard() {
    if (currentCardIndex < habits.length - 1) {
      currentCardIndex++;
    } else {
      loading = true;
      await Promise.all([
        loadHistory(currentUser.id),
        loadStats(currentUser.id),
        loadOtherUserData(otherUser.id)
      ]);
      currentScreen = 'overview';
      loading = false;
      
      if (percentage === 100) {
        triggerConfetti();
      }
    }
  }

  function goToPreviousCard() {
    if (currentCardIndex > 0) {
      currentCardIndex--;
    }
  }

  async function resetDay() {
    currentCardIndex = 0;
    loading = true;
    await loadTodayAnswers(currentUser.id);
    currentScreen = 'dailyHabits';
    showConfetti = false;
    loading = false;
  }

  function resetToUserSelect() {
    currentScreen = 'userSelect';
    currentUser = null;
    currentCardIndex = 0;
    todayAnswers = {};
    habits = [];
    showConfetti = false;
  }

  function triggerConfetti() {
    showConfetti = true;
    setTimeout(() => {
      showConfetti = false;
    }, 4000);
  }

  function handlePointerStart(e) {
    swipeStartX = e.clientX || e.touches?.[0]?.clientX || 0;
    isDragging = true;
  }

  function handlePointerMove(e) {
    if (!isDragging) return;
    const currentX = e.clientX || e.touches?.[0]?.clientX || 0;
    swipeCurrentX = currentX - swipeStartX;
  }

  function handlePointerEnd() {
    if (!isDragging) return;
    isDragging = false;
    
    if (swipeCurrentX < -100 && currentAnswer !== undefined) {
      goToNextCard();
    } else if (swipeCurrentX > 100 && currentCardIndex > 0) {
      goToPreviousCard();
    }
    
    swipeCurrentX = 0;
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  }
</script>

<svelte:head>
  <style>
    @keyframes ripple {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(2); opacity: 0; }
    }
    @keyframes bounce {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes gradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes confetti-fall {
      0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
      100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .animate-ripple { animation: ripple 0.6s ease-out; }
    .animate-bounce-once { animation: bounce 0.3s ease-in-out; }
    .card-enter { animation: slideIn 0.4s ease-out; }
    .gradient-animate { background-size: 200% 200%; animation: gradient 3s ease infinite; }
    .confetti-piece {
      position: fixed;
      width: 10px;
      height: 10px;
      animation: confetti-fall 3s linear forwards;
      z-index: 9999;
    }
    .spinner {
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
    }
  </style>
</svelte:head>

{#if showConfetti}
  {#each Array(100) as _, i}
    <div 
      class="confetti-piece"
      style="
        left: {Math.random() * 100}%;
        top: -10px;
        background-color: {['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb923c'][Math.floor(Math.random() * 6)]};
        animation-delay: {Math.random() * 0.5}s;
        animation-duration: {2 + Math.random() * 2}s;
      "
    ></div>
  {/each}
{/if}

<div class="min-h-screen">
  {#if loading && currentScreen !== 'userSelect'}
    <div class="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 flex items-center justify-center">
      <div class="text-center">
        <div class="spinner mx-auto mb-4"></div>
        <p class="text-gray-700 font-semibold">Lädt...</p>
      </div>
    </div>

  {:else if currentScreen === 'userSelect'}
    <div class="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 flex items-center justify-center p-4">
      <div class="text-center">
        <h1 class="text-5xl font-bold text-gray-800 mb-3">Habit Tracker</h1>
        <p class="text-gray-600 text-lg mb-12">Wähle deinen Benutzer</p>
        
        <div class="flex flex-col sm:flex-row gap-6 justify-center">
          {#each users as user, i}
            <button
              on:click={() => selectUser(user)}
              class="bg-gradient-to-br {i === 0 ? 'from-blue-400 to-blue-600' : 'from-purple-400 to-purple-600'} hover:opacity-90 text-white rounded-3xl p-10 shadow-2xl transform hover:scale-105 active:scale-95 transition-all duration-300 w-64"
            >
              <div class="text-7xl mb-4">👤</div>
              <div class="text-2xl font-bold">{user.name}</div>
            </button>
          {/each}
        </div>
      </div>
    </div>

  {:else if currentScreen === 'dailyHabits'}
    <div class="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 p-6 flex flex-col">
      <div class="flex items-center justify-between mb-6">
        <button
          on:click={resetToUserSelect}
          class="p-3 hover:bg-white/50 rounded-xl transition-colors active:scale-95"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div class="text-center">
          <h2 class="text-xl font-bold text-gray-800">{currentUser?.name}</h2>
          <p class="text-sm text-gray-600">Frage {currentCardIndex + 1} von {habits.length}</p>
        </div>
        <div class="w-12"></div>
      </div>

      <div class="w-full bg-white/50 rounded-full h-3 mb-8 shadow-inner">
        <div 
          class="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500 shadow-sm"
          style="width: {habits.length > 0 ? ((currentCardIndex + 1) / habits.length) * 100 : 0}%"
        ></div>
      </div>

      {#if currentHabit}
        <div class="flex-1 flex items-center justify-center">
          <div 
            class="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full card-enter cursor-grab active:cursor-grabbing select-none"
            style="transform: translateX({isDragging ? swipeCurrentX : 0}px); transition: {isDragging ? 'none' : 'transform 0.3s'}"
            on:mousedown={handlePointerStart}
            on:mousemove={handlePointerMove}
            on:mouseup={handlePointerEnd}
            on:mouseleave={handlePointerEnd}
            on:touchstart={handlePointerStart}
            on:touchmove={handlePointerMove}
            on:touchend={handlePointerEnd}
          >
            <div class="text-center mb-10">
              <div class="text-7xl mb-6 {currentAnswer !== undefined ? 'animate-bounce-once' : ''}">
                {currentHabit.icon}
              </div>
              <h3 class="text-2xl font-bold text-gray-800 mb-3">
                {currentHabit.title}
              </h3>
              <p class="text-gray-500 text-sm mt-4">👆 Wische oder ziehe für Navigation</p>
            </div>

            <div class="flex gap-4 justify-center mb-8">
              <button
                on:click={() => handleAnswer(true)}
                class="relative overflow-hidden flex-1 {currentAnswer === true 
                  ? 'bg-gradient-to-br from-green-500 to-green-700 ring-4 ring-green-300 scale-105' 
                  : 'bg-gradient-to-br from-green-400 to-green-600 hover:from-green-500 hover:to-green-700'
                } text-white rounded-2xl p-6 shadow-xl transform hover:scale-105 active:scale-95 transition-all duration-300"
              >
                {#if currentAnswer === true}
                  <div class="absolute inset-0 bg-white rounded-2xl animate-ripple opacity-0"></div>
                {/if}
                <svg 
                  class="w-14 h-14 mx-auto mb-2 transition-transform duration-300 {currentAnswer === true ? 'scale-125' : ''}" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
                <div class="text-xl font-bold">Ja</div>
              </button>

              <button
                on:click={() => handleAnswer(false)}
                class="relative overflow-hidden flex-1 {currentAnswer === false 
                  ? 'bg-gradient-to-br from-red-500 to-red-700 ring-4 ring-red-300 scale-105' 
                  : 'bg-gradient-to-br from-red-400 to-red-600 hover:from-red-500 hover:to-red-700'
                } text-white rounded-2xl p-6 shadow-xl transform hover:scale-105 active:scale-95 transition-all duration-300"
              >
                {#if currentAnswer === false}
                  <div class="absolute inset-0 bg-white rounded-2xl animate-ripple opacity-0"></div>
                {/if}
                <svg 
                  class="w-14 h-14 mx-auto mb-2 transition-transform duration-300 {currentAnswer === false ? 'scale-125' : ''}" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
                </svg>
                <div class="text-xl font-bold">Nein</div>
              </button>
            </div>

            <div class="flex gap-3">
              {#if currentCardIndex > 0}
                <button
                  on:click={goToPreviousCard}
                  class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl py-3 px-6 font-semibold transition-all duration-300 flex items-center justify-center gap-2 active:scale-95"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                  </svg>
                  Zurück
                </button>
              {/if}
              
              {#if currentAnswer !== undefined}
                <button
                  on:click={goToNextCard}
                  class="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl py-3 px-6 font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg active:scale-95 gradient-animate"
                >
                  {#if currentCardIndex < habits.length - 1}
                    Weiter
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                    </svg>
                  {:else}
                    Fertig
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                  {/if}
                </button>
              {/if}
            </div>
          </div>
        </div>

        <div class="flex justify-center gap-2 mt-8">
          {#each habits as habit, index}
            <div
              class="h-2 rounded-full transition-all duration-300 {
                index === currentCardIndex 
                  ? 'w-8 bg-purple-600' 
                  : todayAnswers[habit.id] !== undefined
                  ? 'w-2 bg-green-500'
                  : 'w-2 bg-gray-300'
              }"
            ></div>
          {/each}
        </div>
      {/if}
    </div>

 {:else if currentScreen === 'overview'}
  <div class="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 p-6">
    <div class="max-w-4xl mx-auto">

      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <button
          on:click={resetDay}
          class="p-3 hover:bg-white/50 rounded-xl transition-colors active:scale-95"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>

        <h2 class="text-2xl font-bold text-gray-800">{currentUser?.name}</h2>

        <button
          on:click={resetToUserSelect}
          class="px-4 py-2 bg-white/50 hover:bg-white/70 rounded-xl transition-colors text-sm font-medium active:scale-95"
        >
          Wechseln
        </button>
      </div>

      <!-- Gesamtstatistik -->
      <div class="bg-white rounded-3xl shadow-2xl p-8 mb-6 text-center">
        <div class="text-7xl mb-4 animate-bounce-once">
          {percentage >= 80 ? '🎉' : percentage >= 50 ? '👍' : '💪'}
        </div>
        <h3 class="text-3xl font-bold text-gray-800 mb-2">
          {completedToday} von {totalToday} geschafft!
        </h3>
        <p class="text-gray-600 text-lg mb-6">{percentage}% heute erreicht</p>

        <div class="w-full bg-gray-200 rounded-full h-4 shadow-inner">
          <div
            class="bg-gradient-to-r from-green-400 to-green-600 h-4 rounded-full transition-all duration-1000 shadow-sm"
            style="width: {percentage}%"
          ></div>
        </div>
      </div>

      <!-- Vergleich mit anderem Benutzer -->
      {#if otherUser && otherUserData}
        <div class="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-3xl shadow-xl p-6 mb-6">
          <div class="flex items-center justify-between mb-4">
            <h4 class="text-xl font-bold text-gray-800 flex items-center gap-2">
              <span class="text-2xl">🏆</span>
              Vergleich mit {otherUser.name}
            </h4>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="bg-white rounded-2xl p-4 text-center">
              <div class="text-sm text-gray-600 mb-2">Du</div>
              <div class="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {completedToday}
              </div>
              <div class="text-sm text-gray-600">Punkte heute</div>
              <div class="mt-2 text-2xl font-bold {percentage >= otherUserData.percentage ? 'text-green-600' : 'text-orange-600'}">
                {percentage}%
              </div>
            </div>

            <div class="bg-white rounded-2xl p-4 text-center">
              <div class="text-sm text-gray-600 mb-2">{otherUser.name}</div>
              <div class="text-4xl font-bold mb-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                {otherUserData.completed}
              </div>
              <div class="text-sm text-gray-600">Punkte heute</div>
              <div class="mt-2 text-2xl font-bold {otherUserData.percentage >= percentage ? 'text-green-600' : 'text-orange-600'}">
                {otherUserData.percentage}%
              </div>
            </div>
          </div>

          <div class="mt-4 text-center">
            {#if percentage > otherUserData.percentage}
              <p class="text-green-700 font-bold text-lg">🎯 Du liegst vorne!</p>
            {:else if percentage < otherUserData.percentage}
              <p class="text-orange-700 font-bold text-lg">💪 {otherUser.name} liegt vorne!</p>
            {:else}
              <p class="text-blue-700 font-bold text-lg">🤝 Ihr seid gleichauf!</p>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Statistik-Karten -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-2xl shadow-xl p-6 text-center transform hover:scale-105 transition-all">
          <svg class="w-10 h-10 mx-auto mb-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10m-12 8h14a2 2 0 002-2V7a2 2 0 00-2-2h-3.28a2 2 0 01-1.42-.59l-1.42-1.42A2 2 0 0011.28 3H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>
          </svg>
          <div class="text-2xl font-bold">{stats.thisMonth}</div>
          <p class="text-gray-600">Dieser Monat</p>
        </div>

        <div class="bg-white rounded-2xl shadow-xl p-6 text-center transform hover:scale-105 transition-all">
          <svg class="w-10 h-10 mx-auto mb-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.1 0-2 .9-2 2v6a2 2 0 104 0v-6c0-1.1-.9-2-2-2zm0-4a4 4 0 00-4 4v6a4 4 0 108 0v-6a4 4 0 00-4-4z"/>
          </svg>
          <div class="text-2xl font-bold">{stats.thisYear}</div>
          <p class="text-gray-600">Dieses Jahr</p>
        </div>

        <div class="bg-white rounded-2xl shadow-xl p-6 text-center transform hover:scale-105 transition-all">
          <svg class="w-10 h-10 mx-auto mb-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h-2v-3a3 3 0 00-6 0v3H7V8h10v9zm-5 5a5 5 0 110-10 5 5 0 010 10z"/>
          </svg>
          <div class="text-2xl font-bold">{stats.streak}</div>
          <p class="text-gray-600">Streak</p>
        </div>
      </div>

    </div> <!-- closes max-w-4xl -->
  </div> <!-- closes min-h-screen -->