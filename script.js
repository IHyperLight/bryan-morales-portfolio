// Portfolio Interactive Functionality - Performance Optimized

// Performance monitoring
const perfMonitor = (() => {
    if (typeof performance === "undefined" || !console.time)
        return { mark: () => {}, measure: () => {} };

    return {
        mark(name) {
            if (performance.mark) performance.mark(name);
        },
        measure(name, startMark) {
            if (
                performance.measure &&
                performance.getEntriesByName(startMark).length > 0
            ) {
                try {
                    performance.measure(name, startMark);
                } catch (e) {
                    // Silent fail in production
                }
            }
        },
    };
})();

// Pre-create commonly used elements
const performanceCache = {
    viewport: null,
    projectItems: null,
    timers: new Set(),
};

// Utility for optimized will-change management
const willChangeManager = {
    set(element, property = "transform") {
        if (element) element.style.willChange = property;
    },
    clear(element, delay = 100) {
        if (!element) return;
        const timerId = setTimeout(() => {
            element.style.willChange = "auto";
            performanceCache.timers.delete(timerId);
        }, delay);
        performanceCache.timers.add(timerId);
    },
};

// Performance utility: High-frequency RAF scheduler
const rafScheduler = (() => {
    const callbacks = new Set();
    let rafId = null;

    const tick = () => {
        for (const callback of callbacks) {
            try {
                callback();
            } catch (e) {
                console.warn("RAF callback error:", e);
            }
        }
        if (callbacks.size > 0) {
            rafId = requestAnimationFrame(tick);
        } else {
            rafId = null;
        }
    };

    return {
        add(callback) {
            callbacks.add(callback);
            if (!rafId) rafId = requestAnimationFrame(tick);
        },
        remove(callback) {
            callbacks.delete(callback);
        },
    };
})();

// Idle callback scheduler for non-critical tasks
const idleScheduler = (() => {
    const tasks = [];
    let running = false;

    const runTasks = (deadline) => {
        running = true;
        while (
            tasks.length > 0 &&
            (deadline.timeRemaining() > 0 || deadline.didTimeout)
        ) {
            const task = tasks.shift();
            try {
                task();
            } catch (e) {
                console.warn("Idle task error:", e);
            }
        }

        if (tasks.length > 0) {
            scheduleNext();
        } else {
            running = false;
        }
    };

    const scheduleNext = () => {
        if (window.requestIdleCallback) {
            window.requestIdleCallback(runTasks, { timeout: 1000 });
        } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(
                () => runTasks({ timeRemaining: () => 5, didTimeout: false }),
                0
            );
        }
    };

    return {
        schedule(task) {
            tasks.push(task);
            if (!running) scheduleNext();
        },
    };
})();

document.addEventListener("DOMContentLoaded", function () {
    perfMonitor.mark("dom-ready");

    // Cache frequently used elements for performance
    performanceCache.viewport = document.querySelector(".portfolio-container");
    performanceCache.projectItems = document.querySelectorAll(".project-item");

    // Initialize critical components immediately
    perfMonitor.mark("critical-init-start");
    initializeProjectCarousel();
    // CRITICAL: Initialize scroll effects IMMEDIATELY to prevent projects appearing without animation
    // This must run synchronously before any elements enter viewport
    initializeScrollEffects();
    perfMonitor.measure("critical-init", "critical-init-start");

    // Schedule non-critical initializations during idle time
    idleScheduler.schedule(() => {
        perfMonitor.mark("idle-init-start");
        initializeContactButtons();
        initializeSocialButtons();
        initializeDownloadButtons();
        initializeFullscreenModal();
        initializeNavigationMenu();
        initializeCertificateLinks();
        initializeProjectLink();
        initializeThemeToggle(); // Inicializar toggle de tema
        perfMonitor.measure("idle-init", "idle-init-start");
        perfMonitor.measure("total-init", "dom-ready");
    });
});

// Utility functions
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// Performance-optimized animation function
function animatePress(el, scale = 0.9, duration = 150) {
    if (!el) return;

    // Use transform for hardware acceleration
    el.style.transform = `scale(${scale}) translateZ(0)`;
    willChangeManager.set(el);

    const timerId = setTimeout(() => {
        el.style.transform = "translateZ(0)";
        willChangeManager.clear(el, 0);
        performanceCache.timers.delete(timerId);
    }, duration);

    performanceCache.timers.add(timerId);
}

// Viewport-based carousel activation system - ROBUSTLY REFACTORED
// This system prevents carousels from consuming resources when not visible,
// significantly improving performance especially on mobile devices.
//
// Key features:
// - Lazy initialization: Carousels only start when they enter the viewport
// - Smart pause/resume: Carousels pause when leaving viewport and resume when returning
// - Sin conflictos con otras pausas (viewport/fullscreen)
// - Memory efficient: Proper cleanup prevents memory leaks
// - Configurable thresholds: 30% visibility required, 50px margin for smooth transitions
// - Robust error handling: Recovery from corrupted states
const carouselViewportObserver = (() => {
    let observer = null;
    const observedCarousels = new Map();
    let isDestroying = false;

    const initObserver = () => {
        if (observer || isDestroying) return observer;

        try {
            observer = new IntersectionObserver(
                (entries) => {
                    if (isDestroying) return;

                    entries.forEach((entry) => {
                        try {
                            const carouselData = observedCarousels.get(
                                entry.target
                            );
                            if (!carouselData || isDestroying) return;

                            const { carouselState, isInitialized } =
                                carouselData;

                            // Validate carousel state
                            if (
                                !carouselState ||
                                typeof carouselState.initialize !== "function"
                            ) {
                                console.warn(
                                    "Invalid carousel state detected, removing from observer"
                                );
                                unobserve(entry.target);
                                return;
                            }

                            if (entry.isIntersecting) {
                                // Carousel enters viewport
                                if (!isInitialized.value) {
                                    // First time initialization
                                    carouselState.initialize();
                                    isInitialized.value = true;
                                } else {
                                    // Resume from viewport pause
                                    carouselState.resumeFromViewportPause();
                                }
                            } else {
                                // Carousel exits viewport
                                if (isInitialized.value) {
                                    carouselState.pauseForViewport();
                                }
                            }
                        } catch (error) {
                            console.warn(
                                "Carousel viewport observer error:",
                                error
                            );
                            // Attempt to remove problematic carousel
                            try {
                                unobserve(entry.target);
                            } catch (e) {
                                console.warn(
                                    "Failed to unobserve problematic carousel:",
                                    e
                                );
                            }
                        }
                    });
                },
                {
                    root: null,
                    rootMargin: "50px 0px", // Start/stop slightly before entering/leaving viewport
                    threshold: 0.3, // 30% of carousel must be visible
                }
            );
        } catch (error) {
            console.error("Failed to create IntersectionObserver:", error);
            observer = null;
        }

        return observer;
    };

    const observe = (projectContainer, carouselState) => {
        if (isDestroying || !projectContainer || !carouselState) return;

        try {
            const obs = initObserver();
            if (!obs) return;

            const isInitialized = { value: false };

            observedCarousels.set(projectContainer, {
                carouselState,
                isInitialized,
            });

            obs.observe(projectContainer);
        } catch (error) {
            console.warn("Failed to observe carousel:", error);
        }
    };

    const unobserve = (projectContainer) => {
        if (!projectContainer) return;

        try {
            if (observer) {
                observer.unobserve(projectContainer);
            }
            observedCarousels.delete(projectContainer);
        } catch (error) {
            console.warn("Failed to unobserve carousel:", error);
        }
    };

    const cleanup = () => {
        isDestroying = true;

        try {
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            observedCarousels.clear();
        } catch (error) {
            console.warn("Failed to cleanup viewport observer:", error);
        } finally {
            isDestroying = false;
        }
    };

    return { observe, unobserve, cleanup };
})();

// Project carousel with autoplay and pause functionality - Updated for multiple projects
function initializeProjectCarousel() {
    // Use cached project items for better performance
    const projectItems = performanceCache.projectItems;

    projectItems.forEach((projectItem) => {
        initializeSingleCarousel(projectItem);
    });
}

// Initialize carousel for a single project - ROBUSTLY REFACTORED
function initializeSingleCarousel(projectContainer) {
    const media = projectContainer.querySelector(".project-media");
    if (!media) return;

    const viewport = media.querySelector(".carousel-viewport");
    const slides = Array.from(media.querySelectorAll(".carousel-slide"));
    const nextBtn = projectContainer.querySelector(
        ".carousel-controls .carousel-btn.next"
    );
    const prevBtn = projectContainer.querySelector(
        ".carousel-controls .carousel-btn.prev"
    );
    const dots = Array.from(
        projectContainer.querySelectorAll(".carousel-controls .carousel-dot")
    );
    const progressFill = projectContainer.querySelector(
        ".carousel-controls .carousel-progress-fill"
    );

    if (!viewport || slides.length === 0) return;

    // State management with validation
    let index = 0;
    const intervalMs = 5000;
    let timer = null;
    let animationFrame = null;
    let startTs = 0;
    let pauseElapsed = 0;
    let paused = false;
    let viewportPaused = false;
    let initialized = false;
    let destroyed = false;
    // Fullscreen/viewport coordination flags
    let pausedByFullscreen = false; // true cuando el modal de pantalla completa pausa el carrusel
    let shouldAutoStart = false; // iniciar autoplay al entrar en viewport o al inicializar
    let isInViewport = false; // estado actual de intersección
    // Handler para sincronizar con el fin de la transición de la barra
    let progressEndHandler = null;

    // Page Visibility tracking para sincronización perfecta
    let pageHidden = false;
    let hiddenTimestamp = 0;

    // Cleanup tracking (separado para mayor control)
    const cleanupFns = new Set();
    const cleanupTimeouts = new Set();
    const cleanupRafs = new Set();

    const validateState = () => {
        if (destroyed) {
            console.warn("Carousel operation on destroyed instance");
            return false;
        }
        return true;
    };

    const setActive = (i, { animate = true, resetProgress = false } = {}) => {
        if (!validateState()) return;

        try {
            const newIndex = (i + slides.length) % slides.length;

            // Only proceed if index actually changed or force reset requested
            if (newIndex === index && !resetProgress) return;

            index = newIndex;

            slides.forEach((s, idx) => {
                const isActive = idx === index;
                s.classList.toggle("is-active", isActive);
                s.setAttribute("aria-hidden", !isActive);
            });

            dots.forEach((d, idx) => {
                const isActive = idx === index;
                d.classList.toggle("is-active", isActive);
                if (isActive) {
                    d.setAttribute("aria-current", "true");
                } else {
                    d.removeAttribute("aria-current");
                }
            });

            // Always reset progress bar completely on manual changes
            if (resetProgress && progressFill) {
                progressFill.style.transition = "none";
                progressFill.style.width = "0%";
                void progressFill.offsetWidth;
            }
        } catch (error) {
            console.warn("Error in setActive:", error);
        }
    };

    const completeProgressReset = () => {
        if (!validateState()) return;

        try {
            // Stop any ongoing automation immediately
            stopAuto();

            // Force reset progress bar to 0
            if (progressFill) {
                progressFill.style.transition = "none";
                progressFill.style.width = "0%";
                void progressFill.offsetWidth;
            }

            // Reset timing variables
            pauseElapsed = 0;
            startTs = 0;
        } catch (error) {
            console.warn("Error in completeProgressReset:", error);
        }
    };

    const next = () => {
        if (!validateState()) return;
        completeProgressReset();
        setActive(index + 1, { resetProgress: true });
    };

    const prev = () => {
        if (!validateState()) return;
        completeProgressReset();
        setActive(index - 1, { resetProgress: true });
    };

    const stopAuto = () => {
        if (!validateState()) return;

        try {
            // Quitar listener de fin de transición si existe
            if (progressFill && progressEndHandler) {
                progressFill.removeEventListener(
                    "transitionend",
                    progressEndHandler
                );
                progressEndHandler = null;
            }

            if (timer) {
                const t = timer;
                clearTimeout(t);
                cleanupTimeouts.delete(t);
                timer = null;
            }

            if (animationFrame) {
                const raf = animationFrame;
                cancelAnimationFrame(raf);
                cleanupRafs.delete(raf);
                animationFrame = null;
            }

            if (progressFill) {
                // Capturar el ancho actual con máxima precisión
                const computed = window.getComputedStyle(progressFill);
                const currentWidth = computed.width;

                // Detener la transición inmediatamente
                progressFill.style.transition = "none";
                progressFill.style.width = currentWidth;

                // Forzar reflow para aplicar cambios
                void progressFill.offsetWidth;

                // Actualizar pauseElapsed basado en el ancho actual
                const track = progressFill.parentElement;
                if (track && track.clientWidth > 0) {
                    const currentPx = parseFloat(currentWidth) || 0;
                    const totalPx = track.clientWidth;
                    const currentPct = Math.max(
                        0,
                        Math.min(1, currentPx / totalPx)
                    );
                    pauseElapsed = Math.round(currentPct * intervalMs);
                }
            }
        } catch (error) {
            console.warn("Error in stopAuto:", error);
        }
    };
    const startAuto = () => {
        if (!validateState() || viewportPaused || pageHidden) return;

        try {
            // Always stop any existing automation first
            stopAuto();

            // Validación adicional: si la página está oculta, no iniciar
            if (document.hidden) {
                pageHidden = true;
                return;
            }

            // Calculate remaining time, defaulting to full interval if no elapsed time
            const remaining = Math.max(16, intervalMs - pauseElapsed);

            // Set up progress bar animation
            if (progressFill) {
                const currentPct = Math.max(
                    0,
                    Math.min(1, pauseElapsed / intervalMs)
                );

                // Set current position without transition
                progressFill.style.transition = "none";
                progressFill.style.width = `${currentPct * 100}%`;
                void progressFill.offsetWidth; // Force reflow

                // Enable smooth transition to 100% con timing perfecto
                progressFill.style.transition = `width ${remaining}ms linear`;

                // Función unificada para avanzar al siguiente slide exactamente al terminar la transición
                let advanced = false;
                const advance = (source) => {
                    // Protección múltiple contra ejecuciones duplicadas
                    if (advanced) return;
                    if (viewportPaused || destroyed || paused || pageHidden)
                        return;
                    advanced = true;

                    // Limpieza exhaustiva previa
                    if (progressFill && progressEndHandler) {
                        progressFill.removeEventListener(
                            "transitionend",
                            progressEndHandler
                        );
                        progressEndHandler = null;
                    }
                    if (timer) {
                        clearTimeout(timer);
                        cleanupTimeouts.delete(timer);
                        timer = null;
                    }
                    if (animationFrame) {
                        cancelAnimationFrame(animationFrame);
                        cleanupRafs.delete(animationFrame);
                        animationFrame = null;
                    }

                    // Verificación final antes de avanzar
                    if (document.hidden) {
                        pageHidden = true;
                        pauseElapsed = 0;
                        return;
                    }

                    // Reiniciar ciclo con reset completo
                    pauseElapsed = 0;
                    setActive(index + 1, { resetProgress: true });

                    // Re-iniciar solo si sigue siendo válido
                    if (
                        !viewportPaused &&
                        !destroyed &&
                        !paused &&
                        !pageHidden
                    ) {
                        startAuto();
                    }
                };

                // Listener preciso de fin de transición con validación adicional
                progressEndHandler = (e) => {
                    // Validar que es el evento correcto y que la página está visible
                    if (
                        e.target === progressFill &&
                        e.propertyName === "width" &&
                        !document.hidden
                    ) {
                        advance("transitionend");
                    }
                };
                progressFill.addEventListener(
                    "transitionend",
                    progressEndHandler,
                    { once: true }
                );

                // Start progress animation on next frame con validación de visibilidad
                animationFrame = requestAnimationFrame(() => {
                    const raf = animationFrame;
                    if (
                        progressFill &&
                        !viewportPaused &&
                        !destroyed &&
                        !paused &&
                        !document.hidden
                    ) {
                        progressFill.style.width = "100%";
                    }
                    if (raf != null) cleanupRafs.delete(raf);
                    animationFrame = null;
                });
                cleanupRafs.add(animationFrame);

                // Temporizador de respaldo SOLO para casos extremos donde transitionend no se dispara
                // Margen generoso de 250ms para máxima precisión
                timer = setTimeout(() => {
                    if (
                        !viewportPaused &&
                        !destroyed &&
                        !paused &&
                        !advanced &&
                        !document.hidden
                    ) {
                        advance("timeout-fallback");
                    }
                    if (timer != null) cleanupTimeouts.delete(timer);
                    timer = null;
                }, remaining + 250);
                cleanupTimeouts.add(timer);
            }

            // Set timestamp for elapsed time calculation con alta precisión
            startTs = performance.now() - pauseElapsed;
            // El avance se controla por transitionend; el temporizador anterior ahora es solo respaldo
        } catch (error) {
            console.warn("Error in startAuto:", error);
        }
    };

    const pauseAutoplay = () => {
        if (!validateState() || paused) return;

        try {
            paused = true;

            // Calculate elapsed time more precisely using high-resolution timestamp
            const now = performance.now();
            const elapsed = startTs ? now - startTs : 0;

            // Capturar el progreso real de la barra si está disponible
            if (progressFill) {
                const computed = window.getComputedStyle(progressFill);
                const track = progressFill.parentElement;
                if (track && track.clientWidth > 0) {
                    const currentPx = parseFloat(computed.width) || 0;
                    const totalPx = track.clientWidth;
                    const actualPct = Math.max(
                        0,
                        Math.min(1, currentPx / totalPx)
                    );

                    // Usar el mayor valor entre el calculado y el real para máxima precisión
                    const calculatedElapsed = Math.max(
                        0,
                        Math.min(intervalMs, elapsed)
                    );
                    const actualElapsed = Math.round(actualPct * intervalMs);
                    pauseElapsed = Math.max(calculatedElapsed, actualElapsed);
                } else {
                    pauseElapsed = Math.max(0, Math.min(intervalMs, elapsed));
                }
            } else {
                pauseElapsed = Math.max(0, Math.min(intervalMs, elapsed));
            }

            // Stop automation and preserve current progress position
            stopAuto();

            // Set progress bar to current position with maximum precision
            if (progressFill) {
                const pct = Math.max(0, Math.min(1, pauseElapsed / intervalMs));
                progressFill.style.transition = "none";
                progressFill.style.width = `${pct * 100}%`;
                void progressFill.offsetWidth;
            }
        } catch (error) {
            console.warn("Error in pauseAutoplay:", error);
        }
    };

    const resumeAutoplay = () => {
        if (!validateState() || !paused || viewportPaused) return;

        try {
            paused = false;
            startAuto();
        } catch (error) {
            console.warn("Error in resumeAutoplay:", error);
        }
    };

    const pauseForViewport = () => {
        if (!validateState() || viewportPaused) return;

        try {
            viewportPaused = true;
            isInViewport = false;

            // Save current state before pausing with maximum precision
            if (startTs && !paused) {
                const now = performance.now();
                const elapsed = now - startTs;

                // Capturar el progreso real de la barra si está disponible
                if (progressFill) {
                    const computed = window.getComputedStyle(progressFill);
                    const track = progressFill.parentElement;
                    if (track && track.clientWidth > 0) {
                        const currentPx = parseFloat(computed.width) || 0;
                        const totalPx = track.clientWidth;
                        const actualPct = Math.max(
                            0,
                            Math.min(1, currentPx / totalPx)
                        );

                        // Usar el mayor valor entre el calculado y el real
                        const calculatedElapsed = Math.max(
                            0,
                            Math.min(intervalMs, elapsed)
                        );
                        const actualElapsed = Math.round(
                            actualPct * intervalMs
                        );
                        pauseElapsed = Math.max(
                            calculatedElapsed,
                            actualElapsed
                        );
                    } else {
                        pauseElapsed = Math.max(
                            0,
                            Math.min(intervalMs, elapsed)
                        );
                    }
                } else {
                    pauseElapsed = Math.max(0, Math.min(intervalMs, elapsed));
                }
            }

            stopAuto();

            // Pause progress bar with precise positioning
            if (progressFill) {
                const pct = Math.max(0, Math.min(1, pauseElapsed / intervalMs));
                progressFill.style.transition = "none";
                progressFill.style.width = `${pct * 100}%`;
                void progressFill.offsetWidth;
            }
        } catch (error) {
            console.warn("Error in pauseForViewport:", error);
        }
    };

    const resumeFromViewportPause = () => {
        if (!validateState()) return;

        try {
            viewportPaused = false;
            isInViewport = true;

            // No auto-start if fullscreen is open
            if (pausedByFullscreen) return;

            // If there's a pending auto-start request (e.g., from closing fullscreen), honor it
            if (shouldAutoStart) {
                shouldAutoStart = false;
                paused = false;
                completeProgressReset();
                startAuto();
                return;
            }

            // Otherwise, resume only if not manually paused (e.g., fullscreen)
            if (!paused) {
                startAuto();
            }
        } catch (error) {
            console.warn("Error in resumeFromViewportPause:", error);
        }
    };

    const initialize = () => {
        if (!validateState() || initialized) return;

        try {
            initialized = true;
            isInViewport = true; // initialize solo se llama cuando intersecta

            // Set initial state with complete reset
            if (slides.length > 0) {
                completeProgressReset();
                setActive(0, { resetProgress: true });

                // Si hay una pausa por fullscreen, no iniciar aún
                if (pausedByFullscreen) {
                    shouldAutoStart = true; // iniciar cuando se cierre fullscreen y/o vuelva a viewport
                    return;
                }

                // Start autoplay after a small delay to ensure everything is ready
                const initTimer = setTimeout(() => {
                    if (!viewportPaused && !destroyed && !paused) {
                        startAuto();
                    }
                    cleanupTimeouts.delete(initTimer);
                }, 100);
                cleanupTimeouts.add(initTimer);
            }
        } catch (error) {
            console.warn("Error in initialize:", error);
        }
    };

    // Fullscreen coordination API
    const onFullscreenOpen = () => {
        if (!validateState()) return;

        try {
            pausedByFullscreen = true;

            // Si aún no se ha inicializado, marcar para iniciar luego y simular pausa
            if (!initialized) {
                paused = true;
                shouldAutoStart = true;
                return;
            }

            // Si ya está inicializado, pausar de forma segura
            pauseAutoplay();
        } catch (error) {
            console.warn("Error in onFullscreenOpen:", error);
        }
    };

    const onFullscreenClose = () => {
        if (!validateState()) return;

        try {
            pausedByFullscreen = false;

            // Si está en viewport e inicializado, reanudar inmediatamente
            if (initialized && isInViewport) {
                paused = false;
                shouldAutoStart = false;
                completeProgressReset();
                startAuto();
                return;
            }

            // Si aún no está en viewport o no se ha inicializado, marcar para auto-start posterior
            paused = false;
            shouldAutoStart = true;
        } catch (error) {
            console.warn("Error in onFullscreenClose:", error);
        }
    };

    const resetProgress = () => {
        if (!validateState()) return;

        try {
            if (progressFill) {
                progressFill.style.transition = "none";
                progressFill.style.width = "0%";
                void progressFill.offsetWidth;
            }
        } catch (error) {
            console.warn("Error in resetProgress:", error);
        }
    };

    // Page Visibility Handler - Recalibración perfecta al volver de segundo plano
    const handleVisibilityChange = () => {
        if (!validateState()) return;

        try {
            const isHidden = document.hidden;

            // Página oculta - pausar y guardar estado
            if (isHidden && !pageHidden) {
                pageHidden = true;
                hiddenTimestamp = performance.now();

                // Solo pausar si está activo y en viewport
                if (
                    initialized &&
                    isInViewport &&
                    !viewportPaused &&
                    !paused &&
                    !pausedByFullscreen
                ) {
                    // Calcular tiempo transcurrido antes de ocultar
                    if (startTs) {
                        const elapsed = performance.now() - startTs;
                        pauseElapsed = Math.max(
                            0,
                            Math.min(intervalMs, elapsed)
                        );
                    }

                    // Pausar completamente
                    stopAuto();
                }
            }
            // Página visible - recalibrar y reanudar
            else if (!isHidden && pageHidden) {
                pageHidden = false;

                // Solo recalibrar si debe estar activo
                if (
                    initialized &&
                    isInViewport &&
                    !viewportPaused &&
                    !paused &&
                    !pausedByFullscreen
                ) {
                    // Calcular cuánto tiempo estuvo oculta la página
                    const timeHidden = performance.now() - hiddenTimestamp;

                    // Si estuvo oculta más de 100ms, hacer reset completo para evitar desincronización
                    if (timeHidden > 100) {
                        // Reset completo y reinicio limpio
                        completeProgressReset();

                        // Pequeño delay para asegurar que el DOM está listo
                        const recalibrationTimer = setTimeout(() => {
                            if (
                                !destroyed &&
                                !viewportPaused &&
                                !paused &&
                                !pausedByFullscreen
                            ) {
                                startAuto();
                            }
                            cleanupTimeouts.delete(recalibrationTimer);
                        }, 50);
                        cleanupTimeouts.add(recalibrationTimer);
                    } else {
                        // Si fue muy breve, intentar reanudar normalmente
                        startAuto();
                    }
                }

                hiddenTimestamp = 0;
            }
        } catch (error) {
            console.warn("Error in handleVisibilityChange:", error);
        }
    };

    // Registrar el listener de visibilidad
    document.addEventListener("visibilitychange", handleVisibilityChange);
    cleanupFns.add(() => {
        document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange
        );
    });

    // Control event listeners
    nextBtn?.addEventListener("click", () => {
        if (!validateState()) return;

        try {
            next();
            // Restart autoplay immediately if not paused
            if (!paused && !viewportPaused) {
                startAuto();
            } else if (paused) {
                resetProgress();
            }
        } catch (error) {
            console.warn("Error in nextBtn click:", error);
        }
    });

    prevBtn?.addEventListener("click", () => {
        if (!validateState()) return;

        try {
            prev();
            // Restart autoplay immediately if not paused
            if (!paused && !viewportPaused) {
                startAuto();
            } else if (paused) {
                resetProgress();
            }
        } catch (error) {
            console.warn("Error in prevBtn click:", error);
        }
    });

    dots.forEach((d, idx) =>
        d.addEventListener("click", () => {
            if (!validateState()) return;

            try {
                completeProgressReset();
                setActive(idx, { resetProgress: true });
                // Restart autoplay immediately if not paused
                if (!paused && !viewportPaused) {
                    startAuto();
                } else if (paused) {
                    resetProgress();
                }
            } catch (error) {
                console.warn("Error in dot click:", error);
            }
        })
    );

    // Teclado (no reanuda si está pausado por viewport o fullscreen)
    media.addEventListener("keydown", (e) => {
        if (!validateState()) return;

        try {
            if (e.key === "ArrowRight") {
                e.preventDefault();
                next();
                if (!paused && !viewportPaused) {
                    startAuto();
                } else if (paused) {
                    resetProgress();
                }
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                prev();
                if (!paused && !viewportPaused) {
                    startAuto();
                } else if (paused) {
                    resetProgress();
                }
            }
        } catch (error) {
            console.warn("Error in keyboard navigation:", error);
        }
    });

    // Click navigation on image (left/right side)
    viewport.addEventListener("click", (e) => {
        if (!validateState()) return;

        try {
            const rect = viewport.getBoundingClientRect();
            const mid = rect.left + rect.width / 2;
            if (e.clientX >= mid) {
                next();
            } else {
                prev();
            }

            if (!paused && !viewportPaused) {
                startAuto();
            } else if (paused) {
                resetProgress();
            }
        } catch (error) {
            console.warn("Error in viewport click:", error);
        }
    });

    // (Pausa por hover eliminada intencionalmente)

    // Adjust progress bar width to match indicators
    const adjustProgressWidth = () => {
        if (!validateState()) return;

        try {
            const indicators = projectContainer.querySelector(
                ".carousel-controls .carousel-indicators"
            );
            const progress = projectContainer.querySelector(
                ".carousel-controls .carousel-progress"
            );
            if (indicators && progress) {
                progress.style.width = `${indicators.offsetWidth}px`;
            }
        } catch (error) {
            console.warn("Error in adjustProgressWidth:", error);
        }
    };

    // Window resize handler with cleanup tracking
    const resizeObserver = new ResizeObserver(() => {
        if (!destroyed) {
            adjustProgressWidth();
        }
    });

    cleanupFns.add(() => {
        resizeObserver.disconnect();
    });

    resizeObserver.observe(projectContainer);
    adjustProgressWidth();

    // Extended carousel state for viewport management
    const carouselState = {
        // Original functions
        pauseAutoplay,
        resumeAutoplay,
        next,
        prev,
        setActive,

        // New viewport-aware functions
        initialize,
        pauseForViewport,
        resumeFromViewportPause,
        onFullscreenOpen,
        onFullscreenClose,

        // Comprehensive cleanup function
        cleanup: () => {
            if (destroyed) return;

            try {
                destroyed = true;

                // Stop all automation
                stopAuto();

                // (Timeouts de hover eliminados)

                // Execute function cleanups
                cleanupFns.forEach((fn) => {
                    try {
                        fn();
                    } catch (error) {
                        console.warn("Error in cleanup fn:", error);
                    }
                });
                cleanupFns.clear();

                // Cancel rAFs
                cleanupRafs.forEach((id) => {
                    try {
                        cancelAnimationFrame(id);
                    } catch {}
                });
                cleanupRafs.clear();

                // Clear timeouts
                cleanupTimeouts.forEach((id) => {
                    try {
                        clearTimeout(id);
                    } catch {}
                });
                cleanupTimeouts.clear();

                // Reset state
                initialized = false;
                paused = false;
                viewportPaused = false;
                pauseElapsed = 0;
                index = 0;

                // Limpieza del carrusel completada (log eliminado para evitar ruido)
            } catch (error) {
                console.warn("Error in carousel cleanup:", error);
            }
        },
    };

    // Register with viewport observer instead of auto-initializing
    carouselViewportObserver.observe(projectContainer, carouselState);

    // Expose state for fullscreen functionality
    exposeCarouselState(projectContainer, carouselState);
}

// Event delegation system
const eventDelegator = (() => {
    const delegateMap = new Map();

    function addDelegatedListener(
        container,
        selector,
        event,
        handler,
        options = {}
    ) {
        const key = `${event}-${selector}`;
        if (!delegateMap.has(key)) {
            const delegatedHandler = (e) => {
                const target = e.target.closest(selector);
                if (target && container.contains(target)) {
                    handler.call(target, e);
                }
            };

            container.addEventListener(event, delegatedHandler, options);
            delegateMap.set(key, { container, handler: delegatedHandler });
        }
    }

    return { addDelegatedListener };
})();

// Contact buttons functionality
function initializeContactButtons() {
    // Use event delegation for better performance
    const container = performanceCache.viewport;
    if (!container) return;

    eventDelegator.addDelegatedListener(
        container,
        ".contact-btn",
        "click",
        function () {
            animatePress(this);
            const href = this.getAttribute("data-href");
            if (href && href !== "#") {
                const w = window.open(href, "_blank", "noopener,noreferrer");
                if (w) w.opener = null;
            }
        },
        { passive: false }
    );
}

// Social media buttons functionality
function initializeSocialButtons() {
    // Use event delegation for better performance
    const container = performanceCache.viewport;
    if (!container) return;

    eventDelegator.addDelegatedListener(
        container,
        ".social-btn",
        "click",
        function () {
            animatePress(this);
            const url = this.getAttribute("data-url");
            if (url) {
                const w = window.open(url, "_blank", "noopener,noreferrer");
                if (w) w.opener = null;
            }
        },
        { passive: false }
    );
}

// Navigation Menu functionality
function initializeNavigationMenu() {
    const menuButton = document.querySelector(".menu-button");
    const navMenu = document.querySelector(".nav-menu");
    const navMenuOverlay = document.querySelector(".nav-menu-overlay");
    const navMenuList = document.querySelector(".nav-menu-list");

    if (!menuButton || !navMenu || !navMenuList) return;

    // Prevent multiple initializations - PROTECCIÓN MEJORADA
    if (navMenuList.dataset.initialized === "true") {
        // Si ya está inicializado, solo verificar que el estado sea consistente
        if (navMenuList.dataset.navLocked === "true") {
            // Limpiar cualquier lock huérfano
            delete navMenuList.dataset.navLocked;
            navMenuList.style.pointerEvents = "";
            navMenuList.removeAttribute("aria-disabled");
        }
        if (menuButton.dataset.navLocked === "true") {
            delete menuButton.dataset.navLocked;
            menuButton.removeAttribute("aria-disabled");
            menuButton.style.pointerEvents = "";
            if (typeof menuButton.disabled === "boolean") {
                menuButton.disabled = false;
            }
        }
        return;
    }
    navMenuList.dataset.initialized = "true";

    // State management
    let fadeObserver = null;
    let fadeScrollHandler = null;

    const navInteractionState = {
        active: false,
        releaseTimer: null,
        timers: new Set(),
        rafId: null,
    };

    // Debug helper (descomentar para diagnóstico)
    const debugLog = (action, details = {}) => {
        // console.log(`[NAV] ${action}`, { active: navInteractionState.active, timers: navInteractionState.timers.size, ...details });
    };

    const clearNavigationTimers = () => {
        navInteractionState.timers.forEach((id) => {
            clearTimeout(id);
        });
        navInteractionState.timers.clear();
    };

    const stopNavigationRaf = () => {
        if (navInteractionState.rafId !== null) {
            cancelAnimationFrame(navInteractionState.rafId);
            navInteractionState.rafId = null;
        }
    };

    const setNavigationPointerState = (locked) => {
        if (navMenuList) {
            if (locked) {
                navMenuList.dataset.navLocked = "true";
                navMenuList.style.pointerEvents = "none";
                navMenuList.setAttribute("aria-disabled", "true");
            } else {
                delete navMenuList.dataset.navLocked;
                navMenuList.style.pointerEvents = "";
                navMenuList.removeAttribute("aria-disabled");
            }
        }

        if (menuButton) {
            if (locked) {
                menuButton.dataset.navLocked = "true";
                menuButton.setAttribute("aria-disabled", "true");
                menuButton.style.pointerEvents = "none";
                if (typeof menuButton.disabled === "boolean") {
                    menuButton.disabled = true;
                }
            } else {
                delete menuButton.dataset.navLocked;
                menuButton.removeAttribute("aria-disabled");
                menuButton.style.pointerEvents = "";
                if (typeof menuButton.disabled === "boolean") {
                    menuButton.disabled = false;
                }
            }
        }
    };

    const scheduleNavigationTask = (callback, delay) => {
        const timerId = setTimeout(() => {
            navInteractionState.timers.delete(timerId);
            try {
                callback();
            } catch (error) {
                console.error("Navigation task error:", error);
                // En caso de error, liberar el lock para no dejar el menú bloqueado
                releaseNavigationLock("task-error", { force: true });
            }
        }, delay);

        navInteractionState.timers.add(timerId);
        return timerId;
    };

    const releaseNavigationLock = (
        reason = "complete",
        { force = false } = {}
    ) => {
        if (!navInteractionState.active && !force) {
            debugLog("Lock release SKIPPED", { reason, notActive: true });
            if (navInteractionState.releaseTimer) {
                clearTimeout(navInteractionState.releaseTimer);
                navInteractionState.releaseTimer = null;
            }
            return;
        }

        debugLog("Lock RELEASED", {
            reason,
            force,
            timersCleared: navInteractionState.timers.size,
        });

        if (navInteractionState.releaseTimer) {
            clearTimeout(navInteractionState.releaseTimer);
            navInteractionState.releaseTimer = null;
        }

        // CORRECCIÓN: SIEMPRE limpiar timers al liberar el lock
        clearNavigationTimers();

        stopNavigationRaf();

        navInteractionState.active = false;
        setNavigationPointerState(false);
    };

    const acquireNavigationLock = (
        reason = "navigation",
        fallbackMs = 6000
    ) => {
        if (navInteractionState.active) {
            debugLog("Lock acquisition DENIED", {
                reason,
                currentlyActive: true,
            });
            return false;
        }

        navInteractionState.active = true;
        debugLog("Lock ACQUIRED", { reason, fallbackMs });

        clearNavigationTimers();
        stopNavigationRaf();

        setNavigationPointerState(true);

        if (navInteractionState.releaseTimer) {
            clearTimeout(navInteractionState.releaseTimer);
        }

        navInteractionState.releaseTimer = setTimeout(() => {
            debugLog("Lock TIMEOUT", { reason, fallbackMs });
            releaseNavigationLock("timeout", { force: true });
        }, fallbackMs);

        return true;
    };

    const monitorScrollCompletion = (targetPosition) => {
        let stableFrames = 0;
        let lastY = window.scrollY;
        let checksCount = 0;
        const tolerance = 2;
        const maxChecks = 180; // 3 segundos a 60fps

        const checkScroll = () => {
            // Verificación de seguridad: si el lock ya no está activo, cancelar monitoreo
            if (!navInteractionState.active) {
                // CORRECCIÓN: Limpiar rafId antes de salir
                navInteractionState.rafId = null;
                return;
            }

            checksCount++;
            const currentY = window.scrollY;

            // CORRECCIÓN: Actualizar lastY en cada frame para detección precisa
            const scrollStopped = Math.abs(currentY - lastY) <= 0.5;
            lastY = currentY;

            // Verificar si alcanzamos la posición objetivo
            const nearTarget = Math.abs(currentY - targetPosition) <= tolerance;

            if (nearTarget || scrollStopped) {
                stableFrames += 1;
            } else {
                stableFrames = 0;
            }

            // Liberar si se estabilizó o si superamos el tiempo máximo
            if (stableFrames >= 6 || checksCount >= maxChecks) {
                releaseNavigationLock("stabilized");
                return;
            }

            // Solo continuar si el estado sigue activo
            if (navInteractionState.active) {
                navInteractionState.rafId = requestAnimationFrame(checkScroll);
            }
        };

        navInteractionState.rafId = requestAnimationFrame(checkScroll);
    };

    // NOTA: handleVisibilityChange, cleanup y handleResize se definirán DESPUÉS
    // de los event handlers para evitar referencias a funciones no definidas

    // Populate menu with project entries
    const populateMenu = () => {
        // Clear existing items (except "About Me")
        const existingItems = navMenuList.querySelectorAll(
            "li:not(:first-child)"
        );
        existingItems.forEach((item) => item.remove());

        const projects = document.querySelectorAll(
            ".project-item[id^='project-']"
        );

        projects.forEach((project) => {
            const projectId = project.id;
            const title = project.dataset.projectTitle || "Untitled Project";
            const category = project.dataset.projectCategory || "Project";
            const description = project.dataset.projectDescription || "";

            // Create menu item
            const li = document.createElement("li");
            const link = document.createElement("a");
            link.href = `#${projectId}`;
            link.className = "nav-menu-item";
            link.dataset.target = projectId;

            // Create content structure matching project cards exactly
            const content = document.createElement("div");
            content.className = "nav-item-content";

            // Title with emoji
            const titleEl = document.createElement("span");
            titleEl.className = "nav-item-title";
            titleEl.textContent = title;

            // Meta with icon and category
            const metaEl = document.createElement("div");
            metaEl.className = "nav-item-meta";

            // Icon button (matching project-icon style)
            const iconWrapper = document.createElement("div");
            iconWrapper.className = "nav-item-icon";
            const icon = document.createElement("img");
            // Use design.svg for design projects, code.svg for others
            const isDesignProject =
                category.toLowerCase().includes("design") ||
                category.toLowerCase().includes("ui/ux");
            icon.src = isDesignProject
                ? "assets/icons/design.svg"
                : "assets/icons/code.svg";
            icon.alt = "Project icon";
            icon.width = 16;
            icon.height = 16;
            iconWrapper.appendChild(icon);

            // Category text (matching project-category style)
            const categoryEl = document.createElement("p");
            categoryEl.className = "nav-item-category";

            const strong = document.createElement("strong");
            strong.textContent = category;

            const separator = document.createElement("span");
            separator.className = "separator";
            separator.textContent = " · ";

            const descText = document.createTextNode(description);

            categoryEl.appendChild(strong);
            categoryEl.appendChild(separator);
            categoryEl.appendChild(descText);

            // Assemble meta
            metaEl.appendChild(iconWrapper);
            metaEl.appendChild(categoryEl);

            // Assemble content
            content.appendChild(titleEl);
            content.appendChild(metaEl);

            link.appendChild(content);
            li.appendChild(link);
            navMenuList.appendChild(li);
        });
    };

    // Open menu
    const openMenu = () => {
        if (navInteractionState.active) return;

        navMenu.classList.add("active");
        document.body.classList.add("menu-open");
        menuButton.classList.add("active");
        menuButton.setAttribute("aria-label", "Cerrar menú");

        // Add staggered animation to menu items
        const menuItems = navMenuList.querySelectorAll("li");
        menuItems.forEach((item, index) => {
            item.style.animationDelay = `${0.05 + index * 0.05}s`;
        });
    };

    // Close menu
    const closeMenu = ({ preserveLock = false } = {}) => {
        navMenu.classList.remove("active");
        document.body.classList.remove("menu-open");
        menuButton.classList.remove("active");
        menuButton.setAttribute("aria-label", "Abrir menú");

        clearNavigationTimers();

        if (!preserveLock) {
            releaseNavigationLock("menu-closed", { force: true });
        }
    };

    // Smooth scroll to target
    const scrollToTarget = (targetId) => {
        if (!acquireNavigationLock("menu-navigation")) {
            return;
        }

        const target = document.getElementById(targetId);
        if (!target) {
            releaseNavigationLock("missing-target", { force: true });
            return;
        }

        closeMenu({ preserveLock: true });

        const offset = 80;
        const targetPosition =
            target.getBoundingClientRect().top + window.pageYOffset - offset;

        // CORRECCIÓN: Mover listener cleanup fuera para garantizar limpieza
        let userScrollDetected = false;
        let listenersRegistered = false;

        const cleanupScrollListeners = () => {
            if (listenersRegistered) {
                window.removeEventListener("wheel", handleUserScroll);
                window.removeEventListener("touchmove", handleUserScroll);
                listenersRegistered = false;
            }
        };

        const handleUserScroll = () => {
            // Solo cancelar si el scroll NO es hacia la posición objetivo
            const currentScroll = window.scrollY;
            const distanceToTarget = Math.abs(currentScroll - targetPosition);

            // Si el usuario scrollea lejos del objetivo, cancelar animación
            if (distanceToTarget > 100) {
                userScrollDetected = true;
                cleanupScrollListeners();
                releaseNavigationLock("user-interrupted", { force: true });
            }
        };

        scheduleNavigationTask(() => {
            // CORRECCIÓN: Try-catch para garantizar cleanup en caso de error
            try {
                // Registrar listeners para detectar scroll del usuario
                window.addEventListener("wheel", handleUserScroll, {
                    passive: true,
                    once: false,
                });
                window.addEventListener("touchmove", handleUserScroll, {
                    passive: true,
                    once: false,
                });
                listenersRegistered = true;

                window.scrollTo({
                    top: targetPosition,
                    behavior: "smooth",
                });

                monitorScrollCompletion(targetPosition);

                scheduleNavigationTask(() => {
                    // CORRECCIÓN: Limpiar listeners SIEMPRE
                    cleanupScrollListeners();

                    if (userScrollDetected) return;

                    target.style.transition = "transform 0.3s ease-out";
                    target.style.transform = "scale(1.01)";

                    scheduleNavigationTask(() => {
                        if (userScrollDetected) return;

                        target.style.transform = "";

                        scheduleNavigationTask(() => {
                            target.style.transition = "";
                            releaseNavigationLock("animation-complete");
                        }, 300);
                    }, 300);
                }, 800);
            } catch (error) {
                // CORRECCIÓN: Garantizar cleanup en caso de error
                cleanupScrollListeners();
                throw error; // Re-throw para que scheduleNavigationTask lo maneje
            }
        }, 300);
    };

    // Event listener handlers (named functions to prevent duplicates)
    const handleMenuButtonClick = () => {
        if (navInteractionState.active) return;

        if (navMenu.classList.contains("active")) {
            closeMenu();
        } else {
            openMenu();
        }
    };

    const handleMenuItemClick = (e) => {
        const menuItem = e.target.closest(".nav-menu-item");
        if (!menuItem) return;

        e.preventDefault();
        e.stopPropagation();

        const targetId = menuItem.dataset.target;
        if (navInteractionState.active) {
            return;
        }

        if (targetId) {
            scrollToTarget(targetId);
        }
    };

    const handleOverlayClick = () => {
        if (navInteractionState.active) return;
        closeMenu();
    };

    const handleEscapeKey = (e) => {
        if (e.key === "Escape" && navMenu.classList.contains("active")) {
            if (navInteractionState.active) return;
            closeMenu();
        }
    };

    const trapFocus = (e) => {
        if (!navMenu.classList.contains("active")) return;

        const focusableElements = navMenu.querySelectorAll(
            'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.key === "Tab") {
            if (e.shiftKey) {
                // Shift + Tab
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                }
            } else {
                // Tab
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        }
    };

    // CORRECCIÓN: Definir handleVisibilityChange DESPUÉS de closeMenu
    const handleVisibilityChange = () => {
        if (document.hidden) {
            releaseNavigationLock("visibility-change", { force: true });
            // Si el menú está abierto cuando se oculta la página, cerrarlo
            if (navMenu && navMenu.classList.contains("active")) {
                // CORRECCIÓN: Solo cerrar visualmente, el lock ya fue liberado
                navMenu.classList.remove("active");
                document.body.classList.remove("menu-open");
                menuButton.classList.remove("active");
                menuButton.setAttribute("aria-label", "Abrir menú");
            }
        } else {
            // Cuando la página vuelve a estar visible, verificar estado
            // y asegurar que no haya locks huérfanos
            requestAnimationFrame(() => {
                if (
                    navInteractionState.active &&
                    !navMenu.classList.contains("active")
                ) {
                    // Lock activo pero menú cerrado = estado inconsistente
                    releaseNavigationLock("visibility-restore", {
                        force: true,
                    });
                }
            });
        }
    };

    // CORRECCIÓN: Protección contra resize con debouncing
    let resizeTimer = null;
    const handleResize = () => {
        if (navInteractionState.active) {
            // CORRECCIÓN: Cancelar timer anterior para evitar acumulación
            if (resizeTimer) {
                navInteractionState.timers.delete(resizeTimer);
                clearTimeout(resizeTimer);
            }
            // Si hay un resize durante navegación, puede causar problemas
            // Liberar el lock después de un breve delay para permitir reajuste
            resizeTimer = scheduleNavigationTask(() => {
                if (navInteractionState.active) {
                    releaseNavigationLock("resize-safety", { force: true });
                }
                resizeTimer = null;
            }, 500);
        }
    };

    // CORRECCIÓN: Definir cleanup DESPUÉS de todos los handlers
    const cleanup = () => {
        releaseNavigationLock("cleanup", { force: true });

        if (fadeObserver) {
            fadeObserver.disconnect();
            fadeObserver = null;
        }
        if (fadeScrollHandler && navMenuList) {
            navMenuList.removeEventListener("scroll", fadeScrollHandler);
            fadeScrollHandler = null;
        }

        // Limpiar TODOS los listeners globales
        menuButton.removeEventListener("click", handleMenuButtonClick);
        if (navMenuOverlay) {
            navMenuOverlay.removeEventListener("click", handleOverlayClick);
        }
        navMenuList.removeEventListener("click", handleMenuItemClick);
        document.removeEventListener("keydown", handleEscapeKey);
        document.removeEventListener("keydown", trapFocus);
        document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange
        );
        window.removeEventListener("resize", handleResize);
    };

    // Remove any existing listeners before adding new ones (using the same named functions)
    menuButton.removeEventListener("click", handleMenuButtonClick);
    if (navMenuOverlay) {
        navMenuOverlay.removeEventListener("click", handleOverlayClick);
    }
    navMenuList.removeEventListener("click", handleMenuItemClick);
    document.removeEventListener("keydown", handleEscapeKey);
    document.removeEventListener("keydown", trapFocus);

    // Add event listeners with the named functions
    menuButton.addEventListener("click", handleMenuButtonClick);
    if (navMenuOverlay) {
        navMenuOverlay.addEventListener("click", handleOverlayClick);
    }
    navMenuList.addEventListener("click", handleMenuItemClick);
    document.addEventListener("keydown", handleEscapeKey);
    document.addEventListener("keydown", trapFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("resize", handleResize, { passive: true });

    // Registrar cleanup global para prevenir fugas de memoria
    window.addEventListener("beforeunload", cleanup, { once: true });

    // Initialize scroll fade effect for navigation menu
    const initializeNavMenuScrollFade = () => {
        const updateNavFade = () => {
            // Safety check in case menu was removed from DOM
            if (!navMenuList || !navMenuList.isConnected) return;

            const { scrollTop, scrollHeight, clientHeight } = navMenuList;
            const hasOverflow = scrollHeight > clientHeight + 1;

            if (!hasOverflow) {
                navMenuList.style.maskImage = "none";
                navMenuList.style.webkitMaskImage = "none";
                return;
            }

            // Dynamic mask based on scroll position (identical to project descriptions)
            const fadeThreshold = 20;
            const topFade = Math.min(scrollTop / fadeThreshold, 1);
            const bottomFade = Math.min(
                (scrollHeight - clientHeight - scrollTop) / fadeThreshold,
                1
            );

            let maskGradient;
            if (scrollTop <= 5) {
                maskGradient = `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 85%, rgba(0,0,0,${
                    bottomFade * 0.15
                }) 95%, rgba(0,0,0,0) 100%)`;
            } else if (scrollTop >= scrollHeight - clientHeight - 5) {
                maskGradient = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,${
                    topFade * 0.15
                }) 5%, rgba(0,0,0,1) 15%, rgba(0,0,0,1) 100%)`;
            } else {
                maskGradient = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,${
                    topFade * 0.2
                }) 4%, rgba(0,0,0,1) 12%, rgba(0,0,0,1) 88%, rgba(0,0,0,${
                    bottomFade * 0.2
                }) 96%, rgba(0,0,0,0) 100%)`;
            }

            navMenuList.style.maskImage = maskGradient;
            navMenuList.style.webkitMaskImage = maskGradient;
        };

        // Clean up existing fade handler if present
        if (fadeScrollHandler) {
            navMenuList.removeEventListener("scroll", fadeScrollHandler);
        }

        // Store reference to handler for cleanup
        fadeScrollHandler = updateNavFade;

        // Update on scroll
        navMenuList.addEventListener("scroll", fadeScrollHandler, {
            passive: true,
        });

        // Clean up existing observer if present
        if (fadeObserver) {
            fadeObserver.disconnect();
        }

        // Update on menu open with MutationObserver
        fadeObserver = new MutationObserver(() => {
            if (navMenu && navMenu.classList.contains("active")) {
                setTimeout(updateNavFade, 100);
            }
        });
        fadeObserver.observe(navMenu, {
            attributes: true,
            attributeFilter: ["class"],
        });

        // Initial update
        updateNavFade();
    };

    // Populate menu on initialization
    populateMenu();

    // Initialize scroll fade effect
    initializeNavMenuScrollFade();
}

// Scroll effects
function initializeScrollEffects() {
    const observerOptions = {
        // Trigger when at least 5% of the element is visible (more sensitive)
        threshold: 0.05,
        // Trigger animation 100px BEFORE element enters viewport for smooth effect
        // Negative bottom margin means: start observing when element is this far from entering
        rootMargin: "0px 0px -100px 0px",
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                // Mark as animated to prevent re-processing
                if (!entry.target.classList.contains("scroll-animated")) {
                    // Remove inline styles to allow CSS classes to take control
                    entry.target.style.opacity = "";
                    entry.target.style.transform = "";
                    // Apply animation class immediately
                    entry.target.classList.add("scroll-animated");
                    entry.target.classList.remove("scroll-pending");
                }
                // Unobserve after animation to save resources
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const sections = document.querySelectorAll(
        ".glass-card, .certificate-item"
    );

    sections.forEach((section) => {
        // Only apply initial state if not already animated
        if (!section.classList.contains("scroll-animated")) {
            // Los certificados que ya están visibles deben animarse inmediatamente
            const isCertificate =
                section.classList.contains("certificate-item");

            if (isCertificate) {
                // Verificar si el elemento ya está en viewport al cargar
                const rect = section.getBoundingClientRect();
                const isInViewport =
                    rect.top < window.innerHeight && rect.bottom > 0;

                if (isInViewport) {
                    // Animar inmediatamente sin observar
                    requestAnimationFrame(() => {
                        section.style.opacity = "";
                        section.style.transform = "";
                        section.classList.add("scroll-animated");
                        section.classList.remove("scroll-pending");
                    });
                } else {
                    // Si no está visible, observar normalmente
                    section.classList.add("scroll-pending");
                    observer.observe(section);
                }
            } else {
                // Proyectos siempre observados para animación al scroll
                section.classList.add("scroll-pending");
                observer.observe(section);
            }
        }
    });
}

// Certificate links functionality
function initializeCertificateLinks() {
    // Use event delegation for better performance
    const container = performanceCache.viewport;
    if (!container) return;

    // Set up external link buttons (accessibility)
    const items = document.querySelectorAll(".certificate-item.glass-pill");
    items.forEach((item) => {
        const btn = item.querySelector(".external-link");
        if (btn) {
            btn.setAttribute("tabindex", "-1");
            btn.setAttribute("aria-hidden", "true");
        }
    });

    // Delegated click handler
    eventDelegator.addDelegatedListener(
        container,
        ".certificate-item.glass-pill",
        "click",
        function (e) {
            e.stopPropagation();
            const btn = this.querySelector(".external-link");
            const url = btn?.getAttribute("data-url");
            if (url) {
                const w = window.open(url, "_blank", "noopener,noreferrer");
                if (w) w.opener = null;
                animatePress(this, 0.98);
            }
        },
        { passive: false }
    );

    // Delegated keyboard handler
    eventDelegator.addDelegatedListener(
        container,
        ".certificate-item.glass-pill",
        "keydown",
        function (e) {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const btn = this.querySelector(".external-link");
                const url = btn?.getAttribute("data-url");
                if (url) {
                    const w = window.open(url, "_blank", "noopener,noreferrer");
                    if (w) w.opener = null;
                    animatePress(this, 0.98);
                }
            }
        },
        { passive: false }
    );
}

// Project links functionality - Updated for event delegation
function initializeProjectLink() {
    // Use event delegation for better performance
    const container = performanceCache.viewport;
    if (!container) return;

    // Delegated click handler
    eventDelegator.addDelegatedListener(
        container,
        ".project-link",
        "click",
        function () {
            const url = this.getAttribute("data-url");
            if (url) {
                const w = window.open(url, "_blank", "noopener,noreferrer");
                if (w) w.opener = null;
                animatePress(this, 0.98);
            }
        },
        { passive: false }
    );

    // Delegated keyboard handler
    eventDelegator.addDelegatedListener(
        container,
        ".project-link",
        "keydown",
        function (e) {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const url = this.getAttribute("data-url");
                if (url) {
                    const w = window.open(url, "_blank", "noopener,noreferrer");
                    if (w) w.opener = null;
                    animatePress(this, 0.98);
                }
            }
        },
        { passive: false }
    );
}

// Memory cleanup on page unload
window.addEventListener(
    "beforeunload",
    () => {
        // Clean up timers
        for (const id of performanceCache.timers) {
            clearTimeout(id);
        }

        // Clean up carousel viewport observer
        carouselViewportObserver.cleanup();

        // Clean up all carousel states
        const projectItems = performanceCache.projectItems;
        if (projectItems) {
            projectItems.forEach((projectItem) => {
                const media = projectItem.querySelector(".project-media");
                if (media && media._carouselState) {
                    media._carouselState.cleanup();
                }
            });
        }

        // Clear caches
        performanceCache.timers.clear();
    },
    { once: true }
);

// Enhanced scroll indicator with drag functionality and smooth scrolling - Updated for multiple projects
document.addEventListener("DOMContentLoaded", () => {
    // Use cached project items for better performance
    const projectItems = performanceCache.projectItems;

    projectItems.forEach((projectItem) => {
        initializeProjectScroll(projectItem);
    });
});

// Initialize scroll functionality for a single project description
function initializeProjectScroll(projectContainer) {
    const desc = projectContainer.querySelector(
        ".project-description .description-content"
    );
    const track = projectContainer.querySelector(
        ".project-description .scroll-track"
    );
    const thumb = projectContainer.querySelector(
        ".project-description .scroll-thumb"
    );
    if (!desc || !track || !thumb) return;

    let isDragging = false;
    let startY = 0;
    let startScrollTop = 0;
    let activeThumb = null; // Track which thumb is being dragged

    const updateThumb = () => {
        const { scrollTop, scrollHeight, clientHeight } = desc;
        const hasOverflow = scrollHeight > clientHeight + 1;

        track.parentElement.style.display = hasOverflow ? "block" : "none";
        desc.style.overflowY = hasOverflow ? "auto" : "hidden";

        if (!hasOverflow) {
            thumb.style.height = "0px";
            thumb.style.transform = "translateY(0)";
            desc.style.maskImage = "none";
            desc.style.webkitMaskImage = "none";
            return;
        }

        // Update thumb with maximum hardware acceleration and performance
        const ratio = clientHeight / scrollHeight;
        const thumbH = Math.max(20, track.clientHeight * ratio);
        const maxThumbTop = track.clientHeight - thumbH;
        const scrollRatio = scrollTop / (scrollHeight - clientHeight || 1);
        const top = maxThumbTop * scrollRatio;

        // Use translate3d with will-change for maximum GPU acceleration
        thumb.style.height = `${thumbH}px`;
        thumb.style.transform = `translate3d(0, ${
            Math.round(top * 100) / 100
        }px, 0)`;

        // Dynamic will-change optimization
        if (isDragging && activeThumb === thumb) {
            willChangeManager.set(thumb);
        } else {
            willChangeManager.clear(thumb);
        }

        // Dynamic mask based on scroll position
        const fadeThreshold = 20;
        const topFade = Math.min(scrollTop / fadeThreshold, 1);
        const bottomFade = Math.min(
            (scrollHeight - clientHeight - scrollTop) / fadeThreshold,
            1
        );

        let maskGradient;
        if (scrollTop <= 5) {
            maskGradient = `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 85%, rgba(0,0,0,${
                bottomFade * 0.15
            }) 95%, rgba(0,0,0,0) 100%)`;
        } else if (scrollTop >= scrollHeight - clientHeight - 5) {
            maskGradient = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,${
                topFade * 0.15
            }) 5%, rgba(0,0,0,1) 15%, rgba(0,0,0,1) 100%)`;
        } else {
            maskGradient = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,${
                topFade * 0.2
            }) 4%, rgba(0,0,0,1) 12%, rgba(0,0,0,1) 88%, rgba(0,0,0,${
                bottomFade * 0.2
            }) 96%, rgba(0,0,0,0) 100%)`;
        }

        desc.style.maskImage = maskGradient;
        desc.style.webkitMaskImage = maskGradient;
    };

    // Ultra-smooth drag functionality
    const handleMouseDown = (e) => {
        if (e.button !== 0 || e.target !== thumb) return; // Only left mouse button and only on this thumb

        isDragging = true;
        activeThumb = thumb;
        startY = e.clientY;
        startScrollTop = desc.scrollTop;

        // Optimize for maximum dragging performance
        document.body.style.userSelect = "none";
        document.body.style.pointerEvents = "none"; // Disable pointer events on body
        thumb.style.pointerEvents = "auto"; // Keep thumb interactive
        track.style.pointerEvents = "auto"; // Keep track interactive
        thumb.style.transition = "none"; // Remove all transitions during drag

        // Disable smooth scrolling for instant response
        desc.style.scrollBehavior = "auto";

        e.preventDefault();
        e.stopPropagation();
    };

    const handleMouseMove = (e) => {
        if (!isDragging || activeThumb !== thumb) return;

        // Ultra-high precision calculation with immediate response
        const deltaY = e.clientY - startY;
        const trackHeight = track.clientHeight;
        const thumbHeight = parseFloat(thumb.style.height) || 20;
        const maxThumbTop = trackHeight - thumbHeight;

        if (maxThumbTop <= 0) return;

        const ratio = deltaY / maxThumbTop;
        const { scrollHeight, clientHeight } = desc;
        const maxScroll = scrollHeight - clientHeight;

        if (maxScroll <= 0) return;

        const newScrollTop = Math.max(
            0,
            Math.min(maxScroll, startScrollTop + ratio * maxScroll)
        );

        // Direct assignment for zero-latency scrolling
        desc.scrollTop = newScrollTop;

        e.preventDefault();
    };

    const handleMouseUp = (e) => {
        if (!isDragging || activeThumb !== thumb) return;

        isDragging = false;
        activeThumb = null;

        // Restore all original styles
        document.body.style.userSelect = "";
        document.body.style.pointerEvents = "";
        thumb.style.pointerEvents = "";
        track.style.pointerEvents = "";
        thumb.style.transition = ""; // Restore smooth transitions

        // Re-enable smooth scrolling
        desc.style.scrollBehavior = "smooth";

        e.preventDefault();
    };

    // Event listeners - use local handlers instead of global document listeners
    thumb.addEventListener("mousedown", handleMouseDown, { passive: false });

    // Store handlers for cleanup
    if (!desc._scrollHandlers) {
        desc._scrollHandlers = {
            mouseMove: handleMouseMove,
            mouseUp: handleMouseUp,
        };

        // Add global listeners only once per description
        document.addEventListener("mousemove", handleMouseMove, {
            passive: false,
        });
        document.addEventListener("mouseup", handleMouseUp, { passive: false });
    }

    // Enhanced track click with smooth animation
    track.addEventListener(
        "click",
        (e) => {
            if (e.target === thumb || isDragging) return;

            const rect = track.getBoundingClientRect();
            const clickY = e.clientY - rect.top;
            const trackHeight = track.clientHeight;
            const clickRatio = Math.max(0, Math.min(1, clickY / trackHeight));

            const { scrollHeight, clientHeight } = desc;
            const maxScroll = scrollHeight - clientHeight;
            const targetScrollTop = clickRatio * maxScroll;

            // Smooth animated scroll to target
            desc.style.scrollBehavior = "smooth";
            desc.scrollTo({ top: targetScrollTop });

            e.preventDefault();
        },
        { passive: false }
    );

    // High performance scroll handling optimized for 60fps
    let scrollTicking = false;
    let lastScrollTime = 0;
    const SCROLL_THROTTLE = 32; // 30fps - optimal balance of smoothness and performance

    const handleScroll = () => {
        const currentTime = performance.now();

        if (!scrollTicking && currentTime - lastScrollTime >= SCROLL_THROTTLE) {
            rafScheduler.add(() => {
                updateThumb();
                scrollTicking = false;
                lastScrollTime = performance.now();
                rafScheduler.remove(handleScroll);
            });
            scrollTicking = true;
        }
    };

    desc.addEventListener("scroll", handleScroll, { passive: true });

    // Optimized resize handler with proper debounce
    const resizeHandler = debounce(() => {
        rafScheduler.add(updateThumb);
    }, 100);

    window.addEventListener("resize", resizeHandler, { passive: true });

    // Initialize with optimized performance settings
    desc.style.scrollBehavior = "smooth";

    // Performance-optimized initialization with RAF scheduler
    const initUpdate = () => {
        updateThumb();
        // Only enable hardware acceleration when needed
        thumb.style.transform += " translateZ(0)";
        thumb.style.backfaceVisibility = "hidden";
        thumb.style.perspective = "1000px";
        // Optimize the container too
        desc.style.transform = "translateZ(0)";
        desc.style.backfaceVisibility = "hidden";
        desc.style.contain = "layout style";
    };

    // Optimized initialization sequence
    rafScheduler.add(initUpdate);
    requestAnimationFrame(() => rafScheduler.add(initUpdate));
    window.addEventListener("load", () => rafScheduler.add(initUpdate), {
        once: true,
    });
}

// Fullscreen Modal Functionality - Completamente reescrita
function initializeFullscreenModal() {
    // Crear modal solo una vez
    let modal = document.getElementById("fullscreen-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "fullscreen-modal";
        modal.className = "carousel-fullscreen-modal";
        modal.innerHTML = `
            <div class="carousel-fullscreen-content">
                <button class="carousel-fullscreen-close" aria-label="Cerrar pantalla completa"></button>
                <div class="carousel-fullscreen-viewport">
                    <img class="carousel-fullscreen-image" alt="" />
                </div>
                <div class="carousel-fullscreen-nav">
                    <button class="carousel-fullscreen-prev" aria-label="Imagen anterior"></button>
                    <button class="carousel-fullscreen-next" aria-label="Imagen siguiente"></button>
                </div>
                <div class="carousel-fullscreen-counter">1 / 1</div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    let currentImages = [];
    let currentIndex = 0;
    let originalCarousel = null;

    // Referencias a elementos del modal
    const closeBtn = modal.querySelector(".carousel-fullscreen-close");
    const image = modal.querySelector(".carousel-fullscreen-image");
    const prevBtn = modal.querySelector(".carousel-fullscreen-prev");
    const nextBtn = modal.querySelector(".carousel-fullscreen-next");
    const counter = modal.querySelector(".carousel-fullscreen-counter");

    // Funciones del modal
    function openModal(images, startIndex, carousel) {
        currentImages = images;
        currentIndex = startIndex;
        originalCarousel = carousel;

        // Pausar carousel original si existe
        if (originalCarousel) {
            if (typeof originalCarousel.onFullscreenOpen === "function") {
                originalCarousel.onFullscreenOpen();
            } else if (typeof originalCarousel.pauseAutoplay === "function") {
                originalCarousel.pauseAutoplay();
            }
        }

        showCurrentImage();
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }

    function closeModal() {
        modal.classList.remove("active");
        document.body.style.overflow = "";

        // Reanudar carousel original si existe
        setTimeout(() => {
            if (!originalCarousel) return;
            if (typeof originalCarousel.onFullscreenClose === "function") {
                originalCarousel.onFullscreenClose();
            } else if (typeof originalCarousel.resumeAutoplay === "function") {
                originalCarousel.resumeAutoplay();
            }
        }, 300);
    }

    function showCurrentImage() {
        if (currentImages.length > 0) {
            image.src = currentImages[currentIndex].src;
            image.alt = currentImages[currentIndex].alt || "";
            counter.textContent = `${currentIndex + 1} / ${
                currentImages.length
            }`;

            // Mostrar/ocultar botones de navegación
            prevBtn.style.display = currentImages.length > 1 ? "flex" : "none";
            nextBtn.style.display = currentImages.length > 1 ? "flex" : "none";
        }
    }

    function nextImage() {
        if (currentImages.length > 1) {
            currentIndex = (currentIndex + 1) % currentImages.length;
            showCurrentImage();
        }
    }

    function prevImage() {
        if (currentImages.length > 1) {
            currentIndex =
                (currentIndex - 1 + currentImages.length) %
                currentImages.length;
            showCurrentImage();
        }
    }

    // Event listeners
    closeBtn.addEventListener("click", closeModal);
    nextBtn.addEventListener("click", nextImage);
    prevBtn.addEventListener("click", prevImage);

    // Cerrar al hacer clic fuera de la imagen (pero NO en los controles)
    modal.addEventListener("click", (e) => {
        // Solo cerrar si se hace click directamente en el modal o en el content,
        // pero NO en la imagen, botones de navegación, o botón cerrar
        const clickedElement = e.target;
        const isBackground = clickedElement === modal;
        const isContent =
            clickedElement ===
            modal.querySelector(".carousel-fullscreen-content");
        const isViewport =
            clickedElement ===
            modal.querySelector(".carousel-fullscreen-viewport");

        if (isBackground || isContent || isViewport) {
            closeModal();
        }
    });

    // Navegación por teclado - con cleanup pattern
    const modalKeyHandler = (e) => {
        if (!modal.classList.contains("active")) return;

        switch (e.key) {
            case "Escape":
                closeModal();
                break;
            case "ArrowRight":
                e.preventDefault();
                nextImage();
                break;
            case "ArrowLeft":
                e.preventDefault();
                prevImage();
                break;
        }
    };

    // Remove existing handler if present
    if (modal._keyHandler) {
        document.removeEventListener("keydown", modal._keyHandler);
    }
    modal._keyHandler = modalKeyHandler;
    document.addEventListener("keydown", modalKeyHandler);

    // Agregar botones de pantalla completa a los carousels inmediatamente
    const carousels = document.querySelectorAll(".project-media");
    carousels.forEach((carousel) => {
        // Verificar si ya tiene botón
        if (carousel.querySelector(".carousel-fullscreen-btn")) return;

        const slides = carousel.querySelectorAll(".carousel-slide img");
        if (slides.length === 0) return;

        // Crear botón de pantalla completa
        const fullscreenBtn = document.createElement("button");
        fullscreenBtn.className = "carousel-fullscreen-btn";
        fullscreenBtn.setAttribute("aria-label", "Ver en pantalla completa");
        fullscreenBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 3H5C3.89543 3 3 3.89543 3 5V8M16 3H19C20.1046 3 21 3.89543 21 5V8M8 21H5C3.89543 21 3 20.1046 3 19V16M16 21H19C20.1046 21 21 20.1046 21 19V16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;

        // Obtener el contenedor de controles y agregarlo
        const controlsContainer = carousel.parentElement.querySelector(
            ".carousel-controls .carousel-controls-top"
        );
        if (controlsContainer) {
            controlsContainer.appendChild(fullscreenBtn);
        }

        // Event listener para abrir modal
        fullscreenBtn.addEventListener("click", () => {
            const images = Array.from(slides);
            const activeSlideIndex = Array.from(
                carousel.querySelectorAll(".carousel-slide")
            ).findIndex((slide) => slide.classList.contains("is-active"));

            // Obtener estado del carousel si está disponible
            const media = carousel;
            const carouselState = media._carouselState || null;

            openModal(images, Math.max(0, activeSlideIndex), carouselState);
        });
    });
}

// Modificar initializeSingleCarousel para exponer el estado del carousel
function exposeCarouselState(projectContainer, carouselState) {
    const media = projectContainer.querySelector(".project-media");
    if (media) {
        media._carouselState = carouselState;
    }
}

// Initialize Download Buttons
function initializeDownloadButtons() {
    // Use event delegation for better performance
    const container = performanceCache.viewport;
    if (!container) return;

    // Delegated click handler
    eventDelegator.addDelegatedListener(
        container,
        ".download-btn[data-download]",
        "click",
        function () {
            const downloadUrl = this.getAttribute("data-download");
            if (downloadUrl) {
                window.open(downloadUrl, "_blank", "noopener,noreferrer");
            }
        },
        { passive: false }
    );

    // Delegated keyboard handler
    eventDelegator.addDelegatedListener(
        container,
        ".download-btn[data-download]",
        "keydown",
        function (e) {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                this.click();
            }
        },
        { passive: false }
    );
}

// ========================================
// THEME TOGGLE FUNCTIONALITY
// Cambio entre tema Glass (video) y Obsidian (sólido oscuro)
// ========================================
function initializeThemeToggle() {
    const themeToggleButton = document.querySelector(".theme-toggle-button");
    const bgVideo = document.getElementById("bg-video");
    const THEME_KEY = "portfolio-theme";

    if (!themeToggleButton) return;

    // Remover clase de carga inicial del HTML
    document.documentElement.classList.remove("obsidian-theme-loading");

    // Cargar tema guardado
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "obsidian") {
        document.body.classList.add("obsidian-theme");
        if (bgVideo) {
            bgVideo.pause();
        }
    }

    // Manejar click del botón
    themeToggleButton.addEventListener("click", () => {
        const isObsidian = document.body.classList.toggle("obsidian-theme");

        // Guardar preferencia
        localStorage.setItem(THEME_KEY, isObsidian ? "obsidian" : "glass");

        // Controlar video de fondo
        if (bgVideo) {
            if (isObsidian) {
                bgVideo.pause();
            } else {
                bgVideo.play().catch(() => {
                    // Silenciosamente falla si autoplay está bloqueado
                });
            }
        }

        // Animación del botón
        themeToggleButton.style.transform = "scale(0.9)";
        setTimeout(() => {
            themeToggleButton.style.transform = "";
        }, 150);
    });

    // Accesibilidad: soporte de teclado
    themeToggleButton.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            themeToggleButton.click();
        }
    });

    // Inicializar efecto spotlight cuando se active tema Obsidian
    initializeSpotlightEffect();
}

// ========================================
// OBSIDIAN SPOTLIGHT EFFECT
// Efecto de iluminación que sigue al cursor
// con textura granulada revelada
// ========================================
function initializeSpotlightEffect() {
    // Selectores de contenedores que tendrán el efecto
    const spotlightSelectors = [
        '.glass-card',
        '.glass-container'
    ];

    // Cachear elementos para mejor rendimiento
    let spotlightContainers = [];
    let isObsidianTheme = false;
    let rafId = null;

    // Función para crear el overlay del spotlight
    function createSpotlightOverlay(container) {
        // Evitar duplicados
        if (container.querySelector('.spotlight-overlay')) return;
        
        const overlay = document.createElement('div');
        overlay.className = 'spotlight-overlay';
        container.appendChild(overlay);
    }

    // Función para actualizar la lista de contenedores
    function updateContainers() {
        spotlightContainers = document.querySelectorAll(
            spotlightSelectors.join(', ')
        );
        
        // Agregar clase y overlay para contenedores con spotlight
        spotlightContainers.forEach(container => {
            container.classList.add('spotlight-container');
            createSpotlightOverlay(container);
        });
    }

    // Verificar si el tema Obsidian está activo
    function checkTheme() {
        isObsidianTheme = document.body.classList.contains('obsidian-theme');
        
        if (!isObsidianTheme) {
            // Limpiar efectos cuando no es tema Obsidian
            spotlightContainers.forEach(container => {
                container.classList.remove('spotlight-active');
                container.style.setProperty('--spotlight-opacity', '0');
            });
        }
    }

    // Manejar movimiento del mouse
    function handleMouseMove(e) {
        if (!isObsidianTheme) return;
        
        // Cancelar frame anterior
        if (rafId) {
            cancelAnimationFrame(rafId);
        }

        rafId = requestAnimationFrame(() => {
            spotlightContainers.forEach(container => {
                const rect = container.getBoundingClientRect();
                
                // Verificar si el cursor está dentro del contenedor
                const isInside = (
                    e.clientX >= rect.left &&
                    e.clientX <= rect.right &&
                    e.clientY >= rect.top &&
                    e.clientY <= rect.bottom
                );

                if (isInside) {
                    // Calcular posición relativa del cursor dentro del contenedor
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    
                    // Actualizar variables CSS para el spotlight
                    container.style.setProperty('--spotlight-x', `${x}px`);
                    container.style.setProperty('--spotlight-y', `${y}px`);
                    container.style.setProperty('--spotlight-opacity', '1');
                    container.classList.add('spotlight-active');
                    
                    // También actualizar el overlay directamente
                    const overlay = container.querySelector('.spotlight-overlay');
                    if (overlay) {
                        overlay.style.setProperty('--spotlight-x', `${x}px`);
                        overlay.style.setProperty('--spotlight-y', `${y}px`);
                    }
                } else {
                    // Desvanecer el efecto cuando el cursor sale
                    container.classList.remove('spotlight-active');
                    container.style.setProperty('--spotlight-opacity', '0');
                }
            });
        });
    }

    // Manejar cuando el mouse sale de la ventana
    function handleMouseLeave() {
        spotlightContainers.forEach(container => {
            container.classList.remove('spotlight-active');
            container.style.setProperty('--spotlight-opacity', '0');
        });
    }

    // Inicializar
    updateContainers();
    checkTheme();

    // Event listeners
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    // Observar cambios de tema
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                checkTheme();
            }
        });
    });

    observer.observe(document.body, { 
        attributes: true, 
        attributeFilter: ['class'] 
    });

    // Re-escanear contenedores cuando cambie el DOM (para contenido dinámico)
    const domObserver = new MutationObserver(() => {
        updateContainers();
    });

    domObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}
