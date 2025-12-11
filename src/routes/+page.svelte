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
  let showFireworks = false; 
  let showStreakPopup = false;
  let animatePoints = false;
  
  let users = [];
  let habits = [];
  let monthGrid = [];
  let loading = true;
  let selectedMonth = new Date().getMonth();
  let selectedYear = new Date().getFullYear();

  // reactive
  $: currentHabit = habits[currentCardIndex];
  $: currentAnswer = todayAnswers[currentHabit?.id];
  $: completedToday = Object.values(todayAnswers).filter(Boolean).length;
  // Für die Anzeige im Dashboard nutzen wir die lokalen Antworten
  $: earnedPointsToday = habits.length > 0 ? calculateEarnedPoints() : 0;
  $: maxPointsToday = habits.length > 0 ? habits.reduce((sum, h) => sum + (h.points || 1), 0) : 0;
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

  let gsap;
  
  onMount(async () => {
    // GSAP vom Window-Objekt holen (wird durch CDN geladen)
    if (typeof window !== 'undefined') {
      gsap = window.gsap;
    }
    
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
        todayAnswers[log.habit_id] = !!log.completed;
        todayAnswers = { ...todayAnswers };
      });
    }
  }

  // --- KORRIGIERTE FUNKTION: Punkteberechnung ---
  async function updateDailyPoints(userId, date) {
    // 1. Nur die Logs laden (habit_id und completed), KEIN Join auf habits, da fehleranfällig
    const { data: logs } = await supabase
      .from('habit_logs')
      .select('habit_id, completed')
      .eq('user_id', userId)
      .eq('date', date);

    // 2. Berechnung LOKAL durchführen anhand des geladenen habits-Arrays
    // Das ist die sicherste Methode, da wir die Punkte-Werte bereits in 'habits' haben.
    let totalPoints = 0;

    if (logs && logs.length > 0) {
      logs.forEach(log => {
        if (log.completed) {
          // Wir suchen den Habit in unserer lokalen Liste
          const habit = habits.find(h => h.id === log.habit_id);
          if (habit) {
            totalPoints += (habit.points || 1);
          }
        }
      });
    }

    // 3. Update oder Insert in point_logs
    const { data: existingPointLog } = await supabase
      .from('point_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('date', date)
      .single();

    if (existingPointLog) {
      await supabase
        .from('point_logs')
        .update({ points: totalPoints })
        .eq('id', existingPointLog.id);
    } else {
      await supabase
        .from('point_logs')
        .insert({
          user_id: userId,
          date: date,
          points: totalPoints
        });
    }
  }
  // -------------------------------------------------------------

  async function loadMonthData(userId, month, year) {
    const startDateObj = new Date(year, month, 1, 12, 0, 0);
    const endDateObj = new Date(year, month + 1, 0, 12, 0, 0);
    const startDate = startDateObj.toISOString().split('T')[0];
    const endDate = endDateObj.toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('habit_logs')
      .select('*') // Hier brauchen wir keinen Join mehr zwingend für die Logik
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });
      
    if (error) {
      console.error('Error loading month data:', error);
      monthGrid = [];
      return;
    }

    const daysInMonth = endDateObj.getDate();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
  const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  days.push({
        date: iso,
        display: formatDate(iso),
        logsByHabit: {}
      });
    }

    const logs = data || [];
    const logMap = {};
    logs.forEach(log => {
      if (!logMap[log.date]) logMap[log.date] = {};
      logMap[log.date][log.habit_id] = log;
    });

    for (let day of days) {
      for (let habit of habits) {
        day.logsByHabit[habit.id] = (logMap[day.date] && logMap[day.date][habit.id]) ? logMap[day.date][habit.id] : null;
      }
    }

    monthGrid = days;
  }
  async function loadStats(userId) {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0).toISOString().split('T')[0];
  const thisYearStart = new Date(now.getFullYear(), 0, 1, 12, 0, 0).toISOString().split('T')[0];
  
  // Monatspunkte aus point_logs laden
  const { data: monthData } = await supabase
    .from('point_logs')
    .select('points')
    .eq('user_id', userId)
    .gte('date', thisMonthStart);
  
  const monthPoints = monthData?.reduce((sum, row) => sum + (row.points || 0), 0) || 0;

  // Jahrespunkte aus point_logs laden
  const { data: yearData } = await supabase
    .from('point_logs')
    .select('points')
    .eq('user_id', userId)
    .gte('date', thisYearStart);

  const yearPoints = yearData?.reduce((sum, row) => sum + (row.points || 0), 0) || 0;
  
  // Streak (bleibt bei habit_logs)
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
        if (log.completed) streak++;
        else break;
      }
    }
  }

  stats = {
    thisMonth: monthPoints,
    thisYear: yearPoints,
    streak
  };
}
  async function loadStatsForSelectedPeriod(userId, month, year) {
  try {
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    // ... rest des Codes bleibt gleich
  const monthEnd = new Date(year, month + 1, 0);
  const monthEndStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  
  // Monatspunkte
  const { data: monthData } = await supabase
    .from('point_logs')
    .select('points')
    .eq('user_id', userId)
    .gte('date', monthStart)
    .lte('date', monthEndStr);
  
  const monthPoints = monthData?.reduce((sum, row) => sum + (row.points || 0), 0) || 0;

  // Jahrespunkte
  const { data: yearData } = await supabase
    .from('point_logs')
    .select('points')
    .eq('user_id', userId)
    .gte('date', yearStart)
    .lte('date', yearEnd);

  const yearPoints = yearData?.reduce((sum, row) => sum + (row.points || 0), 0) || 0;
  
  // Streak (bleibt gleich)
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
        if (log.completed) streak++;
        else break;
      }
    }
  }

  stats = {
      thisMonth: monthPoints,
      thisYear: yearPoints,
      streak
    };
  } catch (error) {
    console.error('Error loading stats:', error);
    stats = { thisMonth: 0, thisYear: 0, streak: 0 };
  }
}

  async function loadOtherUserStats(otherUserId) {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0).toISOString().split('T')[0];
    const thisYearStart = new Date(now.getFullYear(), 0, 1, 12, 0, 0).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    
    // Heute Detailansicht (completed/total)
    const { data: todayLogs } = await supabase
      .from('habit_logs')
      .select('completed')
      .eq('user_id', otherUserId)
      .eq('date', today);
    // Hier können wir die Punkte nur schätzen oder wir laden kurz die Habits des anderen Users, 
    // aber für die Prozentanzeige reicht die Anzahl completed.
    // Falls Punkte wichtig sind, laden wir point_logs für heute:
    const { data: todayPointLog } = await supabase
        .from('point_logs')
        .select('points')
        .eq('user_id', otherUserId)
        .eq('date', today)
        .single();
    
    const todayPoints = todayPointLog?.points || 0;
    const todayTotal = todayLogs?.length || 0; // Das ist nur die Anzahl der Logs, nicht total possible.
    // Einfachheitshalber: Prozent ist hier basierend auf den Antworten des Users
    
    // Monat aus point_logs
    const { data: monthData } = await supabase
      .from('point_logs')
      .select('points')
      .eq('user_id', otherUserId)
      .gte('date', thisMonthStart);
    const monthPoints = monthData?.reduce((sum, row) => sum + (row.points || 0), 0) || 0;

    // Jahr aus point_logs
    const { data: yearData } = await supabase
      .from('point_logs')
      .select('points')
      .eq('user_id', otherUserId)
      .gte('date', thisYearStart);
    const yearPoints = yearData?.reduce((sum, row) => sum + (row.points || 0), 0) || 0;

    otherUserData = {
      completed: todayPoints,
      total: todayTotal, 
      percentage: 0 // Wird im UI nicht zwingend genutzt oder ist weniger wichtig als Punkte
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
  // Stats im Hintergrund laden
  loadStatsForSelectedPeriod(currentUser.id, selectedMonth, selectedYear);
}

  async function openDashboard() {
  loading = true;
  animatePoints = false; // Wichtig: Zuerst auf false setzen
  await loadHabits(currentUser.id);
  await loadTodayAnswers(currentUser.id);
  await loadStats(currentUser.id);
  if (otherUser) {
    await loadOtherUserStats(otherUser.id);
  }
  currentScreen = 'dashboard';
  loading = false;
  setTimeout(() => {
    animatePoints = true;
  }, 200);
}

  async function handleAnswer(answer) {
    // 1. ERST Animation abspielen
    if (cardElement && gsap) {
      if (answer) {
        animateSuccess(cardElement);  // ✅ Grüne Spring-Animation
      } else {
        animateFailure(cardElement);   // ❌ Rote Wackel-Animation
      }
    }
    
    // 2. Kurze Pause, damit User die Animation sieht
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // 3. DANN erst Daten speichern (wie vorher)
    todayAnswers[currentHabit.id] = answer;
    todayAnswers = { ...todayAnswers };

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
    // 1. Swipe-Animation starten
    if (cardElement && gsap) {
      animate3DSwipe(cardElement, 'left');
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    // 2. Zur nächsten Karte wechseln (Karte ist noch unsichtbar!)
    if (currentCardIndex < habits.length - 1) {
      currentCardIndex++;
      // 3. Kurze Pause damit DOM aktualisiert wird
      await new Promise(resolve => setTimeout(resolve, 50));
      // 4. Jetzt wird automatisch animateCardEntrance aufgerufen (durch $:)
      //    und isTransitioning wird auf false gesetzt
    } else {
      loading = true;
      
      // 1. Zuerst Punkte berechnen und speichern
      const today = new Date().toISOString().split('T')[0];
      await updateDailyPoints(currentUser.id, today);

      // 2. Dann alles neu laden für das Dashboard
      await loadHabits(currentUser.id); // Zur Sicherheit
      await loadTodayAnswers(currentUser.id);
      await loadStats(currentUser.id);
      
      if (otherUser) {
        await loadOtherUserStats(otherUser.id);
      }
      loading = false;
      currentScreen = 'dashboard';
      
      setTimeout(() => {
        animatePoints = true;
        setTimeout(() => {
          if (percentage === 100) {
            triggerConfetti();
            triggerFireworks();  // NEU: Feuerwerk zusätzlich!
          }
          showStreakPopup = true;
          setTimeout(() => {
            showStreakPopup = false;
          }, 1300);
        }, 800);
      }, 200);
    }
  }

  async function goToPreviousCard() {
    if (cardElement && gsap) {
      animate3DSwipe(cardElement, 'right');
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    if (currentCardIndex > 0) {
      currentCardIndex--;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  async function updateMonthLog(logId, completed, date, habitId) {
  if (logId) {
    await supabase
      .from('habit_logs')
      .update({ completed })
      .eq('id', logId);
  } else {
    await supabase
      .from('habit_logs')
      .insert({
        habit_id: habitId,
        user_id: currentUser.id,
        date,
        completed
      });
  }
  
  await updateDailyPoints(currentUser.id, date);
  
  // Wichtig: In dieser Reihenfolge neu laden
  await loadMonthData(currentUser.id, selectedMonth, selectedYear);
  await loadStatsForSelectedPeriod(currentUser.id, selectedMonth, selectedYear);
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

   // NEU: Feuerwerk-Animation
  function triggerFireworks() {
    showFireworks = true;
    setTimeout(() => {
      showFireworks = false;
    }, 5000); // 5 Sekunden spektakuläre Show
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

  function animateCounter(element, start, end, duration) {
  if (!element) return;
  const range = end - start;
  if (range === 0) {
    element.textContent = end;
    return;
  }
  const increment = range / (duration / 16);
  let current = start;
  const timer = setInterval(() => {
    current += increment;
    if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
      current = end;
      element.textContent = Math.floor(current);
      clearInterval(timer);
    } else {
      element.textContent = Math.floor(current);
    }
  }, 16);
}

  $: if (animatePoints && stats.thisMonth !== undefined && stats.thisYear !== undefined) {
  setTimeout(() => {
    const monthEl = document.getElementById('month-points');
    const yearEl = document.getElementById('year-points');
    if (monthEl && yearEl) {
      monthEl.textContent = '0';
      yearEl.textContent = '0';
      animateCounter(monthEl, 0, stats.thisMonth, 1200);
      animateCounter(yearEl, 0, stats.thisYear, 1600);
    }
  }, 100);
}

  let stats = { thisMonth: 0, thisYear: 0, streak: 0 };
  let otherUserData = null;
  let otherUserStats = { thisMonth: 0, thisYear: 0 };
  
  // Animation States
  let cardElement = null;
  let isAnimating = false;
  let isTransitioning = false; // NEU: Verhindert Aufblitzen
  
  // GSAP Animationen (verbesserte Version)
  function animateCardEntrance(node) {
    if (!gsap) return;
    
    // Karte kommt 3D rotierend von rechts
    gsap.fromTo(node, 
      {
        rotateY: 90,
        opacity: 0,
        scale: 0.7,
        x: 100
      },
      {
        duration: 0.7,
        rotateY: 0,
        opacity: 1,
        scale: 1,
        x: 0,
        ease: "back.out(1.4)",
        clearProps: "transform,opacity",
        onStart: () => {
          isTransitioning = false; // Übergang beendet, neue Karte ist da
        }
      }
    );
  }
  
  function animateSuccess(node) {
    if (!gsap || isAnimating) return;
    isAnimating = true;
    
    const tl = gsap.timeline({
      onComplete: () => { isAnimating = false; }
    });
    
    // Karte springt hoch mit leichtem Tilt
    tl.to(node, {
      duration: 0.2,
      scale: 1.08,
      rotateZ: 2, // Z-Achse für 2D-Rotation (nicht Y!)
      ease: "power2.out"
    })
    .to(node, {
      duration: 0.4,
      scale: 1,
      rotateZ: 0,
      ease: "elastic.out(1, 0.6)"
    })
    // Grüner Glow-Effekt
    .to(node, {
      duration: 0.25,
      boxShadow: "0 0 100px rgba(34, 197, 94, 0.8), 0 0 150px rgba(34, 197, 94, 0.4)",
      ease: "power2.out"
    }, 0.1)
    .to(node, {
      duration: 0.4,
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
      ease: "power2.out"
    });
    
    // Icon macht 360° Drehung
    const icon = node.querySelector('.habit-icon');
    if (icon) {
      gsap.fromTo(icon, 
        { rotate: 0, scale: 1 },
        {
          duration: 0.6,
          rotate: 360,
          scale: 1.4,
          ease: "back.out(1.5)",
          onComplete: () => {
            gsap.to(icon, {
              duration: 0.3,
              scale: 1,
              ease: "power2.out"
            });
          }
        }
      );
    }
  }
  
  function animateFailure(node) {
    if (!gsap || isAnimating) return;
    isAnimating = true;
    
    const tl = gsap.timeline({
      onComplete: () => { isAnimating = false; }
    });
    
    // Karte wackelt heftig (Shake)
    tl.to(node, {
      duration: 0.08,
      x: -15,
      ease: "power2.inOut"
    })
    .to(node, {
      duration: 0.08,
      x: 15,
      ease: "power2.inOut"
    })
    .to(node, {
      duration: 0.08,
      x: -12,
      ease: "power2.inOut"
    })
    .to(node, {
      duration: 0.08,
      x: 12,
      ease: "power2.inOut"
    })
    .to(node, {
      duration: 0.08,
      x: -8,
      ease: "power2.inOut"
    })
    .to(node, {
      duration: 0.08,
      x: 0,
      ease: "power2.inOut"
    })
    // Roter Glow
    .to(node, {
      duration: 0.2,
      boxShadow: "0 0 40px rgba(239, 68, 68, 0.7), 0 0 80px rgba(239, 68, 68, 0.3)",
      ease: "power2.inOut"
    }, 0)
    .to(node, {
      duration: 0.35,
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
      ease: "power2.out"
    });
    
    // Icon wackelt mit
    const icon = node.querySelector('.habit-icon');
    if (icon) {
      tl.to(icon, {
        duration: 0.1,
        rotate: -20,
        ease: "power2.inOut"
      }, 0)
      .to(icon, {
        duration: 0.1,
        rotate: 20,
        ease: "power2.inOut"
      })
      .to(icon, {
        duration: 0.1,
        rotate: -15,
        ease: "power2.inOut"
      })
      .to(icon, {
        duration: 0.1,
        rotate: 15,
        ease: "power2.inOut"
      })
      .to(icon, {
        duration: 0.15,
        rotate: 0,
        ease: "power2.out"
      });
    }
  }
  
  function animate3DSwipe(node, direction) {
    if (!gsap) return;
    
    const distance = direction === 'left' ? -400 : 400;
    const rotation = direction === 'left' ? -30 : 30;
    
    gsap.to(node, {
      duration: 0.4,
      x: distance,
      rotation: rotation,
      opacity: 0,
      ease: "power2.in",
      onComplete: () => {
        // JETZT erst unsichtbar machen (nach der Animation!)
        isTransitioning = true;
        
        gsap.set(node, { 
          opacity: 0,
          x: 0, 
          rotation: 0
        });
      }
    });
  }

  // Reactive Statement für Karten-Animation beim Wechsel
  $: if (currentHabit && cardElement && gsap) {
    animateCardEntrance(cardElement);
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
      50% { transform: scale(1.05); }
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideUp {
      from { transform: translateY(30px); opacity: 0; }
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
    @keyframes popIn {
      0% { transform: scale(0); opacity: 0; }
      50% { transform: scale(1.02); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes streakPulse {
      0% { transform: scale(0); opacity: 0; }
      50% { transform: scale(1.15); opacity: 1; }
      75% { transform: scale(0.95); }
      100% { transform: scale(1); opacity: 1; }
    }

    @keyframes streakGlow {
      0%, 100% { box-shadow: 0 0 20px rgba(251, 146, 60, 0.4), 0 0 40px rgba(251, 146, 60, 0.2); }
      50% { box-shadow: 0 0 40px rgba(251, 146, 60, 0.6), 0 0 80px rgba(251, 146, 60, 0.4); }
    }

    .streak-popup { 
      animation: streakPulse 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55), streakGlow 2s ease-in-out infinite;
    }

    @keyframes streakPop {
      0% { transform: scale(0) rotate(-5deg); opacity: 0; }
      60% { transform: scale(1.1) rotate(2deg); opacity: 1; }
      80% { transform: scale(0.95) rotate(-1deg); }
      100% { transform: scale(1) rotate(0); opacity: 1; }
    }
    @keyframes streakOut {
      0% { transform: scale(1); opacity: 1; }
      100% { transform: scale(0.8); opacity: 0; }
    }
    .streak-enter { animation: streakPop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55); }
    .streak-exit { animation: streakOut 0.3s ease-out forwards; }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* threads (thin background lines) */
    @keyframes threadPulse {
      0% { opacity: 0; transform: translateY(0); }
      50% { opacity: 0.18; transform: translateY(-6px); }
      100% { opacity: 0; transform: translateY(0); }
    }
    .threads {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }
    .thread {
      position: absolute;
      width: 1px;
      height: 120%;
      background: linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.02));
      opacity: 0;
      animation: threadPulse 0.9s ease-in-out infinite;
      transform-origin: center;
    }

    /* helpers */
    .animate-ripple { animation: ripple 0.6s ease-out; }
    .animate-bounce-once { animation: bounce 0.25s ease-in-out; }
    .card-enter { animation: slideIn 0.35s ease-out; }
    .slide-up { animation: slideUp 0.45s ease-out; }
    .gradient-animate { background-size: 200% 200%; animation: gradient 3s ease infinite; }
    .pop-in { animation: popIn 0.45s cubic-bezier(0.68, -0.55, 0.265, 1.55); }
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

    /* table grid */
    .month-table {
      overflow-x: auto;
    }
    .month-grid {
      border-collapse: collapse;
      width: 100%;
      min-width: 900px; /* damit viele Tage nebeneinander passen */
    }
    .month-grid th, .month-grid td {
      padding: 8px;
      border: 1px solid rgba(0,0,0,0.06);
      text-align: center;
      font-size: 12px;
      white-space: nowrap;
    }
    
    /* Jede zweite Zeile grau hinterlegen */
    .month-grid tbody tr:nth-child(even) {
      background-color: rgba(0, 0, 0, 0.06);
    }
    
    .month-grid tbody tr:hover {
      background-color: rgba(0, 0, 0, 0.12);
    }
    .habit-name {
      text-align: left;
      padding-left: 12px;
      font-weight: 600;
      min-width: 180px;
    }
    .check {
      display:inline-block;
      width:18px;
      height:18px;
      border-radius:4px;
      line-height:18px;
      font-size:12px;
    }
    .check.done {
      background: linear-gradient(90deg,#34d399,#10b981);
      color: white;
    }
    .check.failed {
      background: linear-gradient(90deg,#ef4444,#dc2626);
      color: white;
      font-weight: bold;
    }
    
    .check.empty {
      background: transparent;
      color: transparent;
      border: 1px dashed rgba(0,0,0,0.04);
    }

    /* 3D Performance Optimierung */
    .habit-card-3d {
      transform-style: preserve-3d;
      backface-visibility: hidden;
      will-change: transform;
    }

    /* Smoother Rendering */
    * {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    /* 3D Karten-Container */
    .habit-card {
      perspective: 1200px;
    }
    
    /* 3D Performance */
    .habit-card-3d {
      transform-style: preserve-3d;
      backface-visibility: hidden;
      will-change: transform;
    }

    /* Karte unsichtbar während Übergang */
    .invisible {
      visibility: hidden !important;
      opacity: 0 !important;
    }

    /* === FIREWORK ANIMATIONS === */
    @keyframes fireworkLaunch {
      0% { 
        transform: translateY(100vh) scale(0.5); 
        opacity: 1; 
      }
      60% { 
        transform: translateY(20vh) scale(0.8); 
        opacity: 1; 
      }
      100% { 
        transform: translateY(20vh) scale(1); 
        opacity: 0; 
      }
    }
    
    @keyframes fireworkExplosion {
      0% { 
        transform: scale(0) rotate(0deg); 
        opacity: 1; 
      }
      50% { 
        transform: scale(1.5) rotate(180deg); 
        opacity: 0.8; 
      }
      100% { 
        transform: scale(2.5) rotate(360deg); 
        opacity: 0; 
      }
    }
    
    @keyframes particleFly {
      0% { 
        transform: translate(0, 0) scale(1); 
        opacity: 1; 
      }
      100% { 
        transform: translate(var(--tx), var(--ty)) scale(0); 
        opacity: 0; 
      }
    }
    
    @keyframes screenFlash {
      0%, 100% { opacity: 0; }
      50% { opacity: 0.8; }
    }
    
    @keyframes shakeScreen {
      0%, 100% { transform: translate(0, 0); }
      10% { transform: translate(-5px, 2px); }
      20% { transform: translate(5px, -2px); }
      30% { transform: translate(-3px, -3px); }
      40% { transform: translate(3px, 3px); }
      50% { transform: translate(-2px, 1px); }
      60% { transform: translate(2px, -1px); }
      70% { transform: translate(-1px, -2px); }
      80% { transform: translate(1px, 2px); }
      90% { transform: translate(-1px, 1px); }
    }
    
    @keyframes perfectTextEnter {
      0% { 
        transform: scale(0) rotate(-180deg); 
        opacity: 0; 
      }
      60% { 
        transform: scale(1.2) rotate(10deg); 
        opacity: 1; 
      }
      80% { 
        transform: scale(0.95) rotate(-5deg); 
      }
      100% { 
        transform: scale(1) rotate(0deg); 
        opacity: 1; 
      }
    }
    
    .firework-container {
      position: fixed;
      inset: 0;
      z-index: 9999;
      pointer-events: none;
      overflow: hidden;
    }
    
    .screen-flash {
      position: fixed;
      inset: 0;
      background: radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,215,0,0.4) 100%);
      animation: screenFlash 0.3s ease-out;
      z-index: 10000;
    }
    
    .screen-shake {
      animation: shakeScreen 0.5s ease-in-out;
    }
    
    .firework {
      position: absolute;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      animation: fireworkLaunch 1s ease-out forwards;
    }
    
    .firework-burst {
      position: absolute;
      width: 200px;
      height: 200px;
      border-radius: 50%;
      border: 3px solid;
      animation: fireworkExplosion 0.8s ease-out forwards;
    }
    
    .firework-particle {
      position: absolute;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      animation: particleFly 1.2s ease-out forwards;
    }
    
    .perfect-text {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10001;
      animation: perfectTextEnter 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
      text-shadow: 0 0 20px rgba(255, 215, 0, 0.8),
                   0 0 40px rgba(255, 215, 0, 0.6),
                   0 0 60px rgba(255, 215, 0, 0.4);
    }
    
    .glow-ring {
      position: fixed;
      top: 50%;
      left: 50%;
      width: 300px;
      height: 300px;
      margin: -150px 0 0 -150px;
      border-radius: 50%;
      border: 4px solid rgba(255, 215, 0, 0.6);
      animation: fireworkExplosion 1.5s ease-out infinite;
      z-index: 9998;
    }
    
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/Flip.min.js"></script>
</svelte:head>

{#if showConfetti}
  {#each Array(80) as _, i}
    <div 
      class="confetti-piece"
      style="left: {Math.random() * 100}%; top: -10px; background-color: {['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb923c'][Math.floor(Math.random() * 6)]}; animation-delay: {Math.random() * 0.5}s; animation-duration: {2 + Math.random() * 2}s;"
    ></div>
  {/each}
{/if}

<!-- NEU: FIREWORK SPECTACLE -->
{#if showFireworks}
  <div class="firework-container">
    <!-- Screen Flash (weißer Blitz) -->
    <div class="screen-flash"></div>
    
    <!-- Goldener Glow Ring -->
    <div class="glow-ring"></div>
    
    <!-- "PERFEKT! 100%" Text -->
    <div class="perfect-text">
      <div class="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-500 to-orange-500 mb-2">
        PERFEKT!
      </div>
      <div class="text-5xl font-bold text-white drop-shadow-lg">
        🎯 100% 🎯
      </div>
    </div>
    
    <!-- Feuerwerks-Raketen (5 Stück) -->
    {#each Array(5) as _, i}
      <div 
        class="firework" 
        style="
          left: {20 + i * 15}%; 
          background: {['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181'][i]};
          animation-delay: {i * 0.3}s;
          box-shadow: 0 0 20px {['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181'][i]};
        "
      ></div>
    {/each}
    
    <!-- Explosions-Ringe (5 Stück, jeweils 0.6s nach Rakete) -->
    {#each Array(5) as _, i}
      <div 
        class="firework-burst" 
        style="
          left: {20 + i * 15}%; 
          top: 20vh;
          border-color: {['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181'][i]};
          animation-delay: {i * 0.3 + 0.6}s;
          box-shadow: 0 0 30px {['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181'][i]};
        "
      ></div>
    {/each}
    
    <!-- Partikel-Explosion (200 Partikel!) -->
    {#each Array(200) as _, i}
      {@const angle = (i / 200) * Math.PI * 2}
      {@const distance = 150 + Math.random() * 200}
      {@const tx = Math.cos(angle) * distance}
      {@const ty = Math.sin(angle) * distance}
      {@const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181', '#FFA07A', '#98D8C8', '#F7DC6F']}
      {@const burstIndex = Math.floor(i / 40)}
      
      <div 
        class="firework-particle" 
        style="
          left: {20 + burstIndex * 15}%; 
          top: 20vh;
          background: {colors[Math.floor(Math.random() * colors.length)]};
          --tx: {tx}px;
          --ty: {ty}px;
          animation-delay: {burstIndex * 0.3 + 0.7 + Math.random() * 0.2}s;
          box-shadow: 0 0 10px {colors[Math.floor(Math.random() * colors.length)]};
        "
      ></div>
    {/each}
  </div>
{/if}

{#if showStreakPopup}
  <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
  <div class="bg-gradient-to-br from-orange-400 to-red-500 rounded-full w-64 h-64 flex flex-col items-center justify-center streak-popup relative overflow-hidden shadow-2xl">
    <div class="absolute inset-0 bg-gradient-to-br from-yellow-300/20 to-transparent rounded-full"></div>
    <div class="relative z-10 text-center">
      <div class="text-white/90 text-xl font-bold mb-2">🔥 Streak 🔥</div>
      <div class="text-white text-7xl font-bold mb-1">{stats.streak}</div>
      <div class="text-white/90 text-lg font-semibold">Tage in Folge</div>
    </div>
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
              <div class="text-7xl mb-4">👀</div>
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
          <p class="text-2xl text-grey-700">{currentUser?.name}</p>
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
            bind:this={cardElement}
            class="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full cursor-grab active:cursor-grabbing select-none relative habit-card"
            class:invisible={isTransitioning}
            style="transform-style: preserve-3d;"
            on:mousedown={handlePointerStart}
            on:mousemove={handlePointerMove}
            on:mouseup={handlePointerEnd}
            on:mouseleave={handlePointerEnd}
            on:touchstart={handlePointerStart}
            on:touchmove={handlePointerMove}
            on:touchend={handlePointerEnd}
        >
            <div class="threads" aria-hidden>
              {#each [20,80,140] as left, i}
                <div class="thread" style="left: {left}px; top: -5%; animation-delay: {i * 0.2}s;"></div>
              {/each}
            </div>

            <div class="text-center mb-6" style="position: relative; z-index: 1;">
              <div class="habit-icon text-7xl mb-4">
                {currentHabit.icon}
              </div>
              <h3 class="text-2xl font-bold text-gray-800 mb-2">
                {currentHabit.title}
              </h3>
              <div class="inline-block bg-gradient-to-r from-purple-400 to-pink-400 text-white px-4 py-2 rounded-full font-bold text-sm">
                {currentHabit.points || 1} Punkt{(currentHabit.points || 1) !== 1 ? 'e' : ''}
              </div>
              <p class="text-gray-500 text-sm mt-4">👆 Wische für Navigation</p>
            </div>

            <div class="flex gap-4 justify-center mb-8" style="position: relative; z-index: 1;">
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

            <div class="flex gap-3" style="position: relative; z-index: 1;">
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
      <div class="max-w-6xl mx-auto">
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

        <div class="bg-white rounded-2xl shadow-xl p-4 month-table">
          <table class="month-grid">
            <thead>
              <tr>
                <th>Tag</th>
                {#each habits as habit}
                  <th title={habit.title}>
                    <div class="flex flex-col items-center gap-1">
                      <div class="text-xl">{habit.icon}</div>
                      <div class="text-xs">{habit.title}</div>
                      <div class="text-xs text-gray-500">{habit.points || 1}P</div>
                    </div>
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each monthGrid as day}
                <tr>
                  <td class="habit-name">
                    <div class="font-semibold">{day.display}</div>
                  </td>

                  {#each habits as habit}
                    <td>
                      {#if day.logsByHabit[habit.id]}
                        <button
                          on:click={() => updateMonthLog(day.logsByHabit[habit.id].id, !day.logsByHabit[habit.id].completed, day.date, habit.id)}
                          class="check {day.logsByHabit[habit.id].completed ? 'done' : 'failed'}"
                          title={day.logsByHabit[habit.id].completed ? 'Erledigt (klicken zum Rückgängig machen)' : 'Nicht erledigt (klicken zum Setzen)'}
                        >
                          {day.logsByHabit[habit.id].completed ? '✓' : '✕'}
                        </button>
                      {:else}
                        <button
                          on:click={() => updateMonthLog(null, true, day.date, habit.id)}
                          class="check empty"
                          title="Noch kein Eintrag (klicken zum Setzen)"
                        >
                        </button>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
          <div class="mt-6 grid grid-cols-2 gap-4">
            <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6 text-center">
              <div class="text-sm text-gray-600 mb-2">Punkte in {getMonthName(selectedMonth)}</div>
              <div class="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {(() => {
                  let sum = 0;
                  monthGrid.forEach(day => {
                    habits.forEach(habit => {
                      const log = day.logsByHabit[habit.id];
                      if (log && log.completed) {
                        sum += (habit.points || 1);
                      }
                    });
                  });
                  return sum;
                })()}
              </div>
            </div>
            
            <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 text-center">
              <div class="text-sm text-gray-600 mb-2">Punkte {selectedYear}</div>
              <div class="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                {stats.thisYear}
              </div>
            </div>
          </div>
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

        <div class="bg-white rounded-3xl shadow-2xl p-8 mb-6 text-center relative overflow-hidden">
          <div class="threads" aria-hidden>
            {#each [10,60,110,170] as left, i}
              <div class="thread" style="left: {left}px; top: -8%; animation-delay: {i * 0.15}s;"></div>
            {/each}
          </div>

          <div class="text-7xl mb-4 animate-bounce-once" style="position: relative; z-index: 1;">
            {percentage >= 80 ? '🎉' : percentage >= 50 ? '👍' : '💪'}
          </div>
          <h3 class="text-3xl font-bold text-gray-800 mb-2" style="position: relative; z-index: 1;">
            {earnedPointsToday} von {maxPointsToday} Punkten!
          </h3>
          <p class="text-gray-600 text-lg mb-6" style="position: relative; z-index: 1;">{percentage}% heute erreicht</p>
          
          <div class="w-full bg-gray-200 rounded-full h-4 shadow-inner mb-8" style="position: relative; z-index: 1;">
            <div 
              class="bg-gradient-to-r from-green-400 to-green-600 h-4 rounded-full transition-all duration-1000 shadow-sm"
              style="width: {percentage}%"
            ></div>
          </div>

          {#if animatePoints}
            <div class="grid grid-cols-2 gap-4 slide-up" style="position: relative; z-index: 1;">
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

        {#if animatePoints && !showStreakPopup}
          <div class="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200 rounded-3xl shadow-xl p-6 mb-6 text-center slide-up" style="animation-delay: 0.15s;">
            <div class="text-2xl font-bold text-gray-800 mb-2">Streak</div>
            <div class="text-4xl font-bold mb-1">{stats.streak}</div>
            <div class="text-gray-600 mt-2">Tage in Folge</div>
          </div>
        {/if}

        {#if otherUser && otherUserStats}
          <div class="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-3xl shadow-xl p-6 mb-6">
            <h4 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span class="text-2xl">⚔️</span>
              Direkter Vergleich
            </h4>
            
            <div class="space-y-4">
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