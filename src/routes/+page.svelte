<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  
  let currentUser = null;
  let currentScreen = 'userSelect'; // userSelect, welcome, dailyHabits, monthView, dashboard
  let currentCardIndex = 0;
  let todayAnswers = {};
  let swipeStartX = 0;
  let swipeCurrentX = 0;
  let isDragging = false;
  let showConfetti = false;
  let showStreakPopup = false;
  let animatePoints = false;
  
  let users = [];
  let habits = [];
  let userHistory = [];
  let otherUserData = null;
  let stats = { thisMonth: 0, thisYear: 0, streak: 0 };
  let otherUserStats = { thisMonth: 0, thisYear: 0 };
  let loading = true;
  let selectedMonth = new Date().getMonth();
  let selectedYear = new Date().getFullYear();
  let monthData = [];

  $: currentHabit = habits[currentCardIndex];
  $: currentAnswer = todayAnswers[currentHabit?.id];
  $: completedToday = Object.values(todayAnswers).filter(Boolean).length;
  $: earnedPointsToday = calculateEarnedPoints();
  $: maxPointsToday = habits.reduce((sum, h) => sum + (h.points || 1), 0);
  $: percentage = maxPointsToday > 0 ? Math.round((earnedPointsToday / maxPointsToday) * 100) : 0;
  $: otherUser = currentUser ? users.find(u => u.id !== currentUser.id) : null;

  function calculateEarnedPoints() {
    let points = 0;
    habits.forEach(habit => {
      if (todayAnswers[habit.id] === true) {
        points += habit.points || 1;
      }
    });
    return points;
  }

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

  async function loadMonthData(userId, month, year) {
    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('habit_logs')
      .select('*, habits(title, icon, points)')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date');

    if (error) {
      console.error('Error loading month data:', error);
      return;
    }

    // Gruppiere nach Datum
    const grouped = {};
    data?.forEach(log => {
      if (!grouped[log.date]) {
        grouped[log.date] = [];
      }
      grouped[log.date].push(log);
    });

    monthData = Object.entries(grouped).map(([date, logs]) => ({
      date,
      logs,
      points: logs.reduce((sum, log) => sum + (log.completed ? (log.habits?.points || 1) : 0), 0)
    })).sort((a, b) => b.date.localeCompare(a.date));
  }

  async function loadStats(userId) {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const thisYearStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];

    // Monatspunkte mit points-Spalte
    const { data: monthLogs } = await supabase
      .from('habit_logs')
      .select('completed, habits(points)')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('date', thisMonthStart);

    const monthPoints = monthLogs?.reduce((sum, log) => sum + (log.habits?.points || 1), 0) || 0;

    // Jahrespunkte
    const { data: yearLogs } = await supabase
      .from('habit_logs')
      .select('completed, habits(points)')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('date', thisYearStart);

    const yearPoints = yearLogs?.reduce((sum, log) => sum + (log.habits?.points || 1), 0) || 0;

    // NoFap Streak berechnen
    const noFapHabit = habits.find(h => h.title.toLowerCase().includes('masturbiert'));
    let streak = 0;
    
    if (noFapHabit) {
      const { data: streakData } = await supabase
        .from('habit_logs')
        .select('date, completed')
        .eq('user_id', userId)
        .eq('habit_id', noFapHabit.id)
        .order('date', { ascending: false });

      if (streakData) {
        for (let log of streakData) {
          if (log.completed) {
            streak++;
          } else {
            break;
          }
        }
      }
    }

    stats = {
      thisMonth: monthPoints,
      thisYear: yearPoints,
      streak
    };
  }

  async function loadOtherUserStats(otherUserId) {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const thisYearStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    // Heute
    const { data: todayLogs } = await supabase
      .from('habit_logs')
      .select('completed, habits(points)')
      .eq('user_id', otherUserId)
      .eq('date', today);

    const todayPoints = todayLogs?.reduce((sum, log) => sum + (log.completed ? (log.habits?.points || 1) : 0), 0) || 0;
    const todayTotal = todayLogs?.length || 0;

    // Monat
    const { data: monthLogs } = await supabase
      .from('habit_logs')
      .select('completed, habits(points)')
      .eq('user_id', otherUserId)
      .eq('completed', true)
      .gte('date', thisMonthStart);

    const monthPoints = monthLogs?.reduce((sum, log) => sum + (log.habits?.points || 1), 0) || 0;

    // Jahr
    const { data: yearLogs } = await supabase
      .from('habit_logs')
      .select('completed, habits(points)')
      .eq('user_id', otherUserId)
      .eq('completed', true)
      .gte('date', thisYearStart);

    const yearPoints = yearLogs?.reduce((sum, log) => sum + (log.habits?.points || 1), 0) || 0;

    otherUserData = {
      completed: todayPoints,
      total: todayTotal,
      percentage: todayTotal > 0 ? Math.round((todayPoints / todayTotal) * 100) : 0
    };

    otherUserStats = {
      thisMonth: monthPoints,
      thisYear: yearPoints
    };
  }

  async function selectUser(user) {
    currentUser = user;
    currentScreen = 'welcome';
  }

  async function startDailyHabits() {
    loading = true;
    await loadHabits(currentUser.id);
    await loadTodayAnswers(currentUser.id);
    currentScreen = 'dailyHabits';
    loading = false;
  }

  async function openMonthView() {
    loading = true;
    await loadHabits(currentUser.id);
    await loadMonthData(currentUser.id, selectedMonth, selectedYear);
    currentScreen = 'monthView';
    loading = false;
  }

  async function openDashboard() {
    loading = true;
    await loadHabits(currentUser.id);
    await loadStats(currentUser.id);
    if (otherUser) {
      await loadOtherUserStats(otherUser.id);
    }
    currentScreen = 'dashboard';
    loading = false;
  }

  async function handleAnswer(answer) {
    todayAnswers[currentHabit.id] = answer;
    todayAnswers = todayAnswers;

    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('habit_logs')
      .select('id')
      .eq('habit_id', currentHabit.id)
      .eq('user_id', currentUser.id)
      .eq('date', today)
      .single();

    if (existing) {
      await supabase
        .from('habit_logs')
        .update({ completed: answer })
        .eq('id', existing.id);
    } else {
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
      await loadStats(currentUser.id);
      if (otherUser) {
        await loadOtherUserStats(otherUser.id);
      }
      loading = false;
      currentScreen = 'dashboard';
      
      // Animationen starten
      setTimeout(() => {
        animatePoints = true;
        setTimeout(() => {
          if (percentage === 100) {
            triggerConfetti();
          }
          showStreakPopup = true;
          setTimeout(() => {
            showStreakPopup = false;
          }, 3000);
        }, 2000);
      }, 300);
    }
  }

  function goToPreviousCard() {
    if (currentCardIndex > 0) {
      currentCardIndex--;
    }
  }

  async function updateMonthLog(logId, completed) {
    await supabase
      .from('habit_logs')
      .update({ completed })
      .eq('id', logId);
    
    await loadMonthData(currentUser.id, selectedMonth, selectedYear);
  }

  function resetToUserSelect() {
    currentScreen = 'userSelect';
    currentUser = null;
    currentCardIndex = 0;
    todayAnswers = {};
    habits = [];
    showConfetti = false;
    animatePoints = false;
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
      month: '2-digit'
    });
  }

  function getMonthName(month) {
    const names = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
                   'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    return names[month];
  }

  // Counter Animation
  function animateCounter(element, start, end, duration) {
    if (!element) return;
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;
    
    const timer = setInterval(() => {
      current += increment;
      if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
        current = end;
        clearInterval(timer);
      }
      element.textContent = Math.floor(current);
    }, 16);
  }

  $: if (animatePoints) {
    setTimeout(() => {
      const monthEl = document.getElementById('month-points');
      const yearEl = document.getElementById('year-points');
      if (monthEl) animateCounter(monthEl, 0, stats.thisMonth, 1500);
      if (yearEl) animateCounter(yearEl, 0, stats.thisYear, 2000);
    }, 100);
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
    @keyframes slideUp {
      from { transform: translateY(50px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
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
    @keyframes lightning {
      0%, 100% { opacity: 0; transform: scale(0.8) rotate(0deg); }
      50% { opacity: 1; transform: scale(1.2) rotate(15deg); }
    }
    @keyframes popIn {
      0% { transform: scale(0); opacity: 0; }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    
    .animate-ripple { animation: ripple 0.6s ease-out; }
    .animate-bounce-once { animation: bounce 0.3s ease-in-out; }
    .card-enter { animation: slideIn 0.4s ease-out; }
    .slide-up { animation: slideUp 0.6s ease-out; }
    .gradient-animate { background-size: 200% 200%; animation: gradient 3s ease infinite; }
    .pop-in { animation: popIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55); }
    .lightning { animation: lightning 0.3s ease-in-out infinite; }
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

{#if showStreakPopup}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-3xl p-8 max-w-sm w-full text-center pop-in relative overflow-hidden">
      <div class="absolute top-4 left-4 text-4xl lightning">⚡</div>
      <div class="absolute top-4 right-4 text-4xl lightning" style="animation-delay: 0.15s;">⚡</div>
      <div class="absolute bottom-4 left-8 text-3xl lightning" style="animation-delay: 0.3s;">⚡</div>
      <div class="absolute bottom-4 right-8 text-3xl lightning" style="animation-delay: 0.45s;">⚡</div>
      
      <div class="text-6xl mb-4">🚫🍆</div>
      <h3 class="text-3xl font-bold text-gray-800 mb-2">NoFap Streak</h3>
      <div class="text-6xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
        {stats.streak}
      </div>
      <p class="text-gray-600 text-lg">Tage am Stück! 💪</p>
    </div>
  </div>
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

  {:else if currentScreen === 'welcome'}
    <div class="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 flex items-center justify-center p-4">
      <div class="max-w-md w-full">
        <div class="text-center mb-8">
          <h1 class="text-4xl font-bold text-gray-800 mb-2 animate-bounce-once">
            Herzlich Willkommen! 😎
          </h1>
          <p class="text-xl text-gray-700">{currentUser?.name}</p>
        </div>

        <div class="space-y-4">
          <button
            on:click={startDailyHabits}
            class="w-full bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white rounded-2xl p-6 shadow-2xl transform hover:scale-105 active:scale-95 transition-all duration-300 text-left"
          >
            <div class="flex items-center gap-4">
              <div class="text-4xl">✅</div>
              <div>
                <div class="text-xl font-bold">Heutigen Tag abschließen</div>
                <div class="text-sm opacity-90">Beantworte deine täglichen Habits</div>
              </div>
            </div>
          </button>

          <button
            on:click={openMonthView}
            class="w-full bg-white hover:bg-gray-50 text-gray-800 rounded-2xl p-6 shadow-xl transform hover:scale-105 active:scale-95 transition-all duration-300 text-left"
          >
            <div class="flex items-center gap-4">
              <div class="text-4xl">📊</div>
              <div>
                <div class="text-xl font-bold">Tabelle & Bearbeiten</div>
                <div class="text-sm text-gray-600">Monatsübersicht mit Vergleich</div>
              </div>
            </div>
          </button>

          <button
            on:click={openDashboard}
            class="w-full bg-white hover:bg-gray-50 text-gray-800 rounded-2xl p-6 shadow-xl transform hover:scale-105 active:scale-95 transition-all duration-300 text-left"
          >
            <div class="flex items-center gap-4">
              <div class="text-4xl">🏆</div>
              <div>
                <div class="text-xl font-bold">Punkte Dashboard</div>
                <div class="text-sm text-gray-600">Statistiken & Vergleich</div>
              </div>
            </div>
          </button>
        </div>

        <button
          on:click={resetToUserSelect}
          class="w-full mt-6 text-gray-600 hover:text-gray-800 py-3 transition-colors"
        >
          ← Zurück zur Benutzerauswahl
        </button>
      </div>
    </div>

  {:else if currentScreen === 'dailyHabits'}
    <div class="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 p-6 flex flex-col">
      <div class="flex items-center justify-between mb-6">
        <button
          on:click={() => currentScreen = 'welcome'}
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
              <div class="inline-block bg-gradient-to-r from-purple-400 to-pink-400 text-white px-4 py-2 rounded-full font-bold text-sm">
                {currentHabit.points || 1} Punkt{(currentHabit.points || 1) !== 1 ? 'e' : ''}
              </div>
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

  {:else if currentScreen === 'monthView'}
    <div class="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 p-6">
      <div class="max-w-4xl mx-auto">
        <div class="flex items-center justify-between mb-6">
          <button
            on:click={() => currentScreen = 'welcome'}
            class="p-3 hover:bg-white/50 rounded-xl transition-colors active:scale-95"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <h2 class="text-2xl font-bold text-gray-800">Monatsübersicht</h2>
          <div class="w-12"></div>
        </div>

        <!-- Monat Auswahl -->
        <div class="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div class="flex gap-4 items-center justify-center">
            <button
              on:click={() => {
                if (selectedMonth === 0) {
                  selectedMonth = 11;
                  selectedYear--;
                } else {
                  selectedMonth--;
                }
                loadMonthData(currentUser.id, selectedMonth, selectedYear);
              }}
              class="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            
            <div class="text-center">
              <div class="text-2xl font-bold text-gray-800">
                {getMonthName(selectedMonth)} {selectedYear}
              </div>
            </div>

            <button
              on:click={() => {
                if (selectedMonth === 11) {
                  selectedMonth = 0;
                  selectedYear++;
                } else {
                  selectedMonth++;
                }
                loadMonthData(currentUser.id, selectedMonth, selectedYear);
              }}
              class="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Tage Liste -->
        <div class="space-y-4">
          {#each monthData as day}
            <div class="bg-white rounded-2xl shadow-xl p-6">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <div class="text-lg font-bold text-gray-800">{formatDate(day.date)}</div>
                  <div class="text-sm text-gray-600">
                    {day.points} Punkt{day.points !== 1 ? 'e' : ''}
                  </div>
                </div>
                <div class="text-3xl">
                  {#if day.points >= maxPointsToday * 0.8}
                    🎉
                  {:else if day.points >= maxPointsToday * 0.5}
                    👍
                  {:else}
                    💪
                  {/if}
                </div>
              </div>

              <div class="space-y-2">
                {#each day.logs as log}
                  <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div class="flex items-center gap-3">
                      <span class="text-2xl">{log.habits?.icon}</span>
                      <div>
                        <div class="font-medium text-gray-800">{log.habits?.title}</div>
                        <div class="text-xs text-gray-500">{log.habits?.points || 1} Punkt{(log.habits?.points || 1) !== 1 ? 'e' : ''}</div>
                      </div>
                    </div>
                    <button
                      on:click={() => updateMonthLog(log.id, !log.completed)}
                      class="p-2 rounded-lg transition-all {log.completed ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}"
                    >
                      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                      </svg>
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>

  {:else if currentScreen === 'dashboard'}
    <div class="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 p-6">
      <div class="max-w-4xl mx-auto">
        <div class="flex items-center justify-between mb-8">
          <button
            on:click={() => currentScreen = 'welcome'}
            class="p-3 hover:bg-white/50 rounded-xl transition-colors active:scale-95"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <h2 class="text-2xl font-bold text-gray-800">{currentUser?.name}</h2>
          <div class="w-12"></div>
        </div>

        <!-- Hauptstatistik mit Animation -->
        <div class="bg-white rounded-3xl shadow-2xl p-8 mb-6 text-center">
          <div class="text-7xl mb-4 animate-bounce-once">
            {percentage >= 80 ? '🎉' : percentage >= 50 ? '👍' : '💪'}
          </div>
          <h3 class="text-3xl font-bold text-gray-800 mb-2">
            {earnedPointsToday} von {maxPointsToday} Punkten!
          </h3>
          <p class="text-gray-600 text-lg mb-6">{percentage}% heute erreicht</p>
          
          <div class="w-full bg-gray-200 rounded-full h-4 shadow-inner mb-8">
            <div 
              class="bg-gradient-to-r from-green-400 to-green-600 h-4 rounded-full transition-all duration-1000 shadow-sm"
              style="width: {percentage}%"
            ></div>
          </div>

          <!-- Animierte Punkte -->
          {#if animatePoints}
            <div class="grid grid-cols-2 gap-4 slide-up">
              <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6">
                <div class="text-sm text-gray-600 mb-2">Punkte diesen Monat</div>
                <div id="month-points" class="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  0
                </div>
              </div>
              
              <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6">
                <div class="text-sm text-gray-600 mb-2">Punkte dieses Jahr</div>
                <div id="year-points" class="text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  0
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- NoFap Streak Box -->
        {#if animatePoints && !showStreakPopup}
          <div class="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200 rounded-3xl shadow-xl p-6 mb-6 text-center slide-up" style="animation-delay: 0.3s;">
            <div class="text-5xl mb-3">🚫🍆</div>
            <div class="text-2xl font-bold text-gray-800 mb-2">NoFap Streak</div>
            <div class="text-6xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              {stats.streak}
            </div>
            <div class="text-gray-600 mt-2">Tage am Stück!</div>
          </div>
        {/if}

        <!-- Vergleich mit anderem Spieler -->
        {#if otherUser && otherUserStats}
          <div class="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-3xl shadow-xl p-6 mb-6">
            <h4 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span class="text-2xl">⚔️</span>
              Direkter Vergleich
            </h4>
            
            <div class="space-y-4">
              <!-- Monat Vergleich -->
              <div class="bg-white rounded-2xl p-4">
                <div class="text-sm text-gray-600 mb-3 text-center font-semibold">Punkte diesen Monat</div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="text-center">
                    <div class="text-sm text-gray-600 mb-1">{currentUser.name}</div>
                    <div class="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                      {stats.thisMonth}
                    </div>
                  </div>
                  <div class="text-center">
                    <div class="text-sm text-gray-600 mb-1">{otherUser.name}</div>
                    <div class="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                      {otherUserStats.thisMonth}
                    </div>
                  </div>
                </div>
                <div class="text-center mt-3">
                  {#if stats.thisMonth > otherUserStats.thisMonth}
                    <span class="text-green-700 font-bold">🏆 Du führst!</span>
                  {:else if stats.thisMonth < otherUserStats.thisMonth}
                    <span class="text-orange-700 font-bold">💪 {otherUser.name} führt!</span>
                  {:else}
                    <span class="text-blue-700 font-bold">🤝 Gleichstand!</span>
                  {/if}
                </div>
              </div>

              <!-- Jahr Vergleich -->
              <div class="bg-white rounded-2xl p-4">
                <div class="text-sm text-gray-600 mb-3 text-center font-semibold">Punkte dieses Jahr</div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="text-center">
                    <div class="text-sm text-gray-600 mb-1">{currentUser.name}</div>
                    <div class="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                      {stats.thisYear}
                    </div>
                  </div>
                  <div class="text-center">
                    <div class="text-sm text-gray-600 mb-1">{otherUser.name}</div>
                    <div class="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                      {otherUserStats.thisYear}
                    </div>
                  </div>
                </div>
                <div class="text-center mt-3">
                  {#if stats.thisYear > otherUserStats.thisYear}
                    <span class="text-green-700 font-bold">🏆 Du führst!</span>
                  {:else if stats.thisYear < otherUserStats.thisYear}
                    <span class="text-orange-700 font-bold">💪 {otherUser.name} führt!</span>
                  {:else}
                    <span class="text-blue-700 font-bold">🤝 Gleichstand!</span>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>