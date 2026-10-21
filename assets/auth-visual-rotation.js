(() => {
  "use strict";

  const visual = document.getElementById("authVisual");
  const screen = document.getElementById("authScreen");
  if (!visual || !screen) return;

  const slides = [
    {
      src: "./assets/kidssync-auth-family-signin.jpg",
      position: "center",
      kicker: "auth.visualKicker",
      title: "auth.visualTitle",
      body: "auth.visualBody"
    },
    {
      src: "./assets/kidssync-family-entryway-signin.jpg",
      position: "58% center",
      kicker: "auth.visualEntryKicker",
      title: "auth.visualEntryTitle",
      body: "auth.visualEntryBody"
    },
    {
      src: "./assets/kidssync-family-park-signin.jpg",
      position: "54% center",
      kicker: "auth.visualParkKicker",
      title: "auth.visualParkTitle",
      body: "auth.visualParkBody"
    },
    {
      src: "./assets/kidssync-family-table-signin.jpg",
      position: "56% center",
      kicker: "auth.visualTableKicker",
      title: "auth.visualTableTitle",
      body: "auth.visualTableBody"
    }
  ];
  const layers = [...visual.querySelectorAll(".auth-visual-image")];
  const dots = [...visual.querySelectorAll("[data-auth-visual-index]")];
  const pauseButton = document.getElementById("authVisualPause");
  const copy = visual.querySelector(".auth-visual-copy");
  const copyFields = {
    kicker: document.getElementById("authVisualKicker"),
    title: document.getElementById("authVisualTitle"),
    body: document.getElementById("authVisualBody")
  };
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const rotationDelay = 9000;
  let currentIndex = 0;
  let timer = 0;
  let copyTimer = 0;
  let transitionToken = 0;
  let userPaused = false;
  let interactionPaused = false;

  function translated(key) {
    return typeof t === "function" ? t(key) : key;
  }

  function setTranslatedText(element, key) {
    if (!element) return;
    element.dataset.i18n = key;
    element.textContent = translated(key);
  }

  function updateCopy(slide) {
    window.clearTimeout(copyTimer);
    copy?.classList.add("is-changing");
    copyTimer = window.setTimeout(() => {
      setTranslatedText(copyFields.kicker, slide.kicker);
      setTranslatedText(copyFields.title, slide.title);
      setTranslatedText(copyFields.body, slide.body);
      copy?.classList.remove("is-changing");
    }, reducedMotion?.matches ? 0 : 180);
  }

  function updateDots() {
    dots.forEach((dot, index) => {
      const active = index === currentIndex;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-pressed", String(active));
    });
  }

  function updatePauseButton() {
    if (!pauseButton) return;
    const key = userPaused ? "auth.playPhotos" : "auth.pausePhotos";
    pauseButton.classList.toggle("is-paused", userPaused);
    pauseButton.setAttribute("aria-pressed", String(userPaused));
    pauseButton.setAttribute("aria-label", translated(key));
    pauseButton.setAttribute("title", translated(key));
    pauseButton.dataset.i18nAria = key;
    pauseButton.dataset.i18nTitle = key;
  }

  function stopRotation() {
    window.clearTimeout(timer);
    timer = 0;
  }

  function canRotate() {
    return !screen.hidden && !document.hidden && !userPaused && !interactionPaused && !reducedMotion?.matches;
  }

  function scheduleRotation() {
    stopRotation();
    if (!canRotate()) return;
    prepareNextSlide();
    timer = window.setTimeout(() => {
      showSlide((currentIndex + 1) % slides.length);
      scheduleRotation();
    }, rotationDelay);
  }

  function prepareNextSlide() {
    const standbyLayer = layers.find(layer => !layer.classList.contains("is-active"));
    if (!standbyLayer || standbyLayer.getAttribute("src")) return;
    const nextIndex = (currentIndex + 1) % slides.length;
    standbyLayer.src = slides[nextIndex].src;
    standbyLayer.style.objectPosition = slides[nextIndex].position;
    standbyLayer.dataset.slideIndex = String(nextIndex);
  }

  function activateLayer(layer, index, token) {
    if (token !== transitionToken) return;
    layers.forEach(image => image.classList.toggle("is-active", image === layer));
    currentIndex = index;
    updateDots();
    updateCopy(slides[index]);
  }

  function showSlide(index) {
    const targetIndex = (Number(index) + slides.length) % slides.length;
    if (targetIndex === currentIndex) {
      updateDots();
      scheduleRotation();
      return;
    }

    const activeLayer = layers.find(layer => layer.classList.contains("is-active")) || layers[0];
    const nextLayer = layers.find(layer => layer !== activeLayer) || layers[0];
    const slide = slides[targetIndex];
    const token = ++transitionToken;
    const activate = () => activateLayer(nextLayer, targetIndex, token);
    nextLayer.style.objectPosition = slide.position;
    nextLayer.dataset.slideIndex = String(targetIndex);
    nextLayer.onload = activate;
    nextLayer.onerror = () => { if (token === transitionToken) scheduleRotation(); };
    nextLayer.src = slide.src;
    if (nextLayer.complete && nextLayer.naturalWidth) activate();
  }

  dots.forEach(dot => dot.addEventListener("click", () => {
    showSlide(Number(dot.dataset.authVisualIndex));
    scheduleRotation();
  }));

  pauseButton?.addEventListener("click", () => {
    userPaused = !userPaused;
    updatePauseButton();
    scheduleRotation();
  });

  visual.addEventListener("mouseenter", () => {
    interactionPaused = true;
    stopRotation();
  });
  visual.addEventListener("mouseleave", () => {
    interactionPaused = false;
    scheduleRotation();
  });
  visual.addEventListener("focusin", () => {
    interactionPaused = true;
    stopRotation();
  });
  visual.addEventListener("focusout", () => {
    window.setTimeout(() => {
      interactionPaused = visual.contains(document.activeElement);
      scheduleRotation();
    }, 0);
  });
  document.addEventListener("visibilitychange", scheduleRotation);
  reducedMotion?.addEventListener?.("change", scheduleRotation);
  new MutationObserver(scheduleRotation).observe(screen, { attributes: true, attributeFilter: ["hidden"] });

  layers[0].dataset.slideIndex = "0";
  layers[0].style.objectPosition = slides[0].position;
  updateDots();
  updatePauseButton();
  scheduleRotation();
})();
