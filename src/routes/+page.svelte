<script>
  let currentUser = null;
  let currentScreen = 'userSelect';
  let currentCardIndex = 0;
  let todayAnswers = {};
  let swipeStartX = 0;
  let swipeCurrentX = 0;
  let isDragging = false;
  
  const users = [
    { id: 1, name: 'Person 1', color: 'from-blue-400 to-blue-600' },
    { id: 2, name: 'Person 2', color: 'from-purple-400 to-purple-600' }
  ];

  const demoHabits = [
    { id: 1, title: 'Hast du heute ein Buch gelesen?', icon: '📚' },
    { id: 2, title: 'Hast du heute Sport gemacht?', icon: '💪' },
    { id: 3, title: 'Hast du genug Wasser getrunken?', icon: '💧' },
    { id: 4, title: 'Hast du meditiert?', icon: '🧘' },
  ];

  const demoHistory = [
    { date: '2024-12-04', points: 3 },
    { date: '2024-12-03', points: 4 },
    { date: '2024-12-02', points: 2 },
    { date: '2024-12-01', points: 4 },
    { date: '2024-11-30', points: 3 },
  ];

  const stats = {
    thisMonth: 18,
    thisYear: 142,
    streak: 5
  };

  $: currentHabit = demoHabits[currentCardIndex];
  $: currentAnswer = todayAnswers[currentHabit?.id];
  $: completedToday = Object.values(todayAnswers).filter(Boolean).length;
  $: totalToday = demoHabits.length;
  $: percentage = Math.round((completedToday / totalToday) * 100);

  function selectUser(user) {
    currentUser = user;
    currentScreen = 'dailyHabits';
  }

  function handleAnswer(answer) {
    todayAnswers[currentHabit.id] = answer;
    todayAnswers = todayAnswers;
  }

  function goToNextCard() {
    if (currentCardIndex < demoHabits.length - 1) {
      currentCardIndex++;
    } else {
      currentScreen = 'overview';
    }
  }

  function goToPreviousCard() {
    if (currentCardIndex > 0) {
      currentCardIndex--;
    }
  }

  function resetDay() {
    currentCardIndex = 0;
    todayAnswers = {};
    currentScreen = 'dailyHabits';
  }

  function resetToUserSelect() {
    currentScreen = 'userSelect';
    currentUser = null;
    currentCardIndex = 0;
    todayAnswers = {};
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
    .animate-ripple { animation: ripple 0.6s ease-out; }
    .animate-bounce-once { animation: bounce 0.3s ease-in-out; }
    .card-enter { animation: slideIn 0.4s ease-out; }
    .gradient-animate { background-size: 200% 200%; animation: gradient 3s ease infinite; }
  </style>
</svelte:head>

<div class="min-h-screen">
  {#if currentScreen === 'userSelect'}
    <div class="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 flex items-center justify-center p-4">
      <div class="text-center">
        <h1 class="text-5xl font-bold text-gray-800 mb-3">Habit Tracker</h1>
        <p class="text-gray-600 text-lg mb-12">Wähle deinen Benutzer</p>
        
        <div class="flex flex-col sm:flex-row gap-6 justify-center">
          {#each users as user}
            <button
              on:click={() => selectUser(user)}
              class="bg-gradient-to-br {user.color} hover:opacity-90 text-white rounded-3xl p-10 shadow-2xl transform hover:scale-105 active:scale-95 transition-all duration-300 w-64"
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
          <p class="text-sm text-gray-600">Frage {currentCardIndex + 1} von {demoHabits.length}</p>
        </div>
        <div class="w-12"></div>
      </div>

      <div class="w-full bg-white/50 rounded-full h-3 mb-8 shadow-inner">
        <div 
          class="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500 shadow-sm"
          style="width: {((currentCardIndex + 1) / demoHabits.length) * 100}%"
        ></div>
      </div>

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
              {currentHabit?.icon}
            </div>
            <h3 class="text-2xl font-bold text-gray-800 mb-3">
              {currentHabit?.title}
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
                {#if currentCardIndex < demoHabits.length - 1}
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
        {#each demoHabits as habit, index}
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
    </div>

  {:else if currentScreen === 'overview'}
    <div class="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 p-6">
      <div class="max-w-4xl mx-auto">
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

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div class="bg-white rounded-2xl shadow-xl p-6 text-center transform hover:scale-105 transition-all">
            <svg class="w-10 h-10 mx-auto mb-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            <div class="text-4xl font-bold text-gray-800 mb-1">{stats.thisMonth}</div>
            <div class="text-gray-600 font-medium">Punkte diesen Monat</div>
          </div>

          <div class="bg-white rounded-2xl shadow-xl p-6 text-center transform hover:scale-105 transition-all">
            <svg class="w-10 h-10 mx-auto mb-3 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div class="text-4xl font-bold text-gray-800 mb-1">{stats.thisYear}</div>
            <div class="text-gray-600 font-medium">Punkte dieses Jahr</div>
          </div>

          <div class="bg-white rounded-2xl shadow-xl p-6 text-center transform hover:scale-105 transition-all">
            <svg class="w-10 h-10 mx-auto mb-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
            </svg>
            <div class="text-4xl font-bold text-gray-800 mb-1">{stats.streak}</div>
            <div class="text-gray-600 font-medium">Tage Streak</div>
          </div>
        </div>

        <div class="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <h4 class="text-xl font-bold text-gray-800 mb-4">Verlauf</h4>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b-2 border-gray-200">
                  <th class="text-left py-3 px-4 text-gray-700 font-semibold">Datum</th>
                  <th class="text-center py-3 px-4 text-gray-700 font-semibold">Punkte</th>
                  <th class="text-right py-3 px-4 text-gray-700 font-semibold">%</th>
                </tr>
              </thead>
              <tbody>
                {#each demoHistory as entry}
                  {@const entryPercentage = Math.round((entry.points / 4) * 100)}
                  <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td class="py-3 px-4 text-gray-700 font-medium">
                      {formatDate(entry.date)}
                    </td>
                    <td class="text-center py-3 px-4">
                      <span class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 text-white font-bold text-lg">
                        {entry.points}
                      </span>
                    </td>
                    <td class="text-right py-3 px-4">
                      <span class="font-bold text-lg {
                        entryPercentage >= 75 ? 'text-green-600' : 
                        entryPercentage >= 50 ? 'text-yellow-600' : 
                        'text-red-600'
                      }">
                        {entryPercentage}%
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <button
          on:click={resetDay}
          class="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-2xl py-4 shadow-xl transform hover:scale-105 active:scale-95 transition-all duration-300 font-bold text-lg gradient-animate"
        >
          Nochmal durchgehen
        </button>

        <p class="text-center text-gray-600 text-sm mt-4">
          💡 Demo-Version - Daten werden noch nicht gespeichert
        </p>
      </div>
    </div>
  {/if}
</div>