/* A book on a desk. The scroll position drives the camera and turns the pages. */
(() => {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);
  const root = document.documentElement;
  const world = $(".world");
  const desk = $(".desk");
  const book = $(".book");
  const leaves = [...book.querySelectorAll(".leaf")];
  const fronts = leaves.map((leaf) => $(".front", leaf));
  const backs = leaves.map((leaf) => $(".back", leaf));
  const shadowL = $(".book-shadow.l");
  const shadowR = $(".book-shadow.r");
  const track = $(".track");
  const intro = $(".intro");
  const outro = $(".outro");
  const pageLabel = $(".pager output");
  const prevBtn = $("[data-prev]");
  const nextBtn = $("[data-next]");
  const sheet = $(".sheet");
  const sheetBody = $(".sheet-body");

  const LEAVES = leaves.length;      // one turn per leaf, covers included
  const PAGE_W = 640;
  const PAGE_H = 400;
  const FAR = 0.76;                  // camera distance while the book is shut
  const LIFT = 3;                    // gap between stacked leaves
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const touchOnly = matchMedia("(hover: none)");

  let vertical = false;   // tall screens: the book is bound along its top edge
  let fit = 1;            // scale that makes the open book fit the window
  let turn = 1;           // how far to scroll for one page turn, in pixels
  let lastW = 0;
  let lastH = 0;
  let target = 0;         // where the scroll bar says we are, in page turns
  let current = 0;        // where the drawing is; it eases toward target
  let rest = 0;           // the spread the book last settled on
  let spread = -1;        // settled spread, or -1 while a page is in the air
  let frame = 0;
  let glide = 0;          // animation frame of a scroll the page started itself
  let snapTimer = 0;
  let touching = false;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function spreadName(n) {
    if (n <= 0) return "Front cover";
    if (n >= LEAVES) return "Back cover";
    if (n === 1) return "Contents and page 1";
    if (n === LEAVES - 1) return "Last page";
    return `Pages ${2 * n - 2} and ${2 * n - 1}`;
  }

  function measure() {
    const w = innerWidth;
    const h = innerHeight;
    vertical = w < 820 && h > w * 1.05;
    root.classList.toggle("is-vertical", vertical);
    fit = vertical
      ? Math.min((w * 0.9) / PAGE_W, (h * 0.6) / (PAGE_H * 2))
      : Math.min((w * 0.8) / (PAGE_W * 2), (h * 0.52) / PAGE_H);
    // A phone's address bar sliding away changes the height a little; that is
    // not a real resize, so the scroll length stays as it was.
    if (Math.abs(w - lastW) > 1 || Math.abs(h - lastH) > 140) {
      lastW = w;
      lastH = h;
      turn = Math.round(h * 0.88);
      track.style.setProperty("--travel", `${LEAVES * turn}px`);
      if (track.offsetHeight) scrollTo(0, rest * turn);   // stay on the same spread
    }
    readScroll();
    current = target;
    render();
  }

  function readScroll() {
    target = clamp(scrollY / turn, 0, LEAVES);
  }

  function render() {
    const p = reduceMotion.matches ? Math.round(current) : current;
    const opened = ease(clamp(p, 0, 1));
    const closed = ease(clamp(p - (LEAVES - 1), 0, 1));
    const near = opened * (1 - closed);

    // Camera: pull in and level out as the cover opens, back off as it shuts.
    const zoom = FAR + (1 - FAR) * near;
    const k = fit * zoom;
    const tiltOpen = vertical ? 15 : 25;
    const tilt = tiltOpen + (vertical ? 7 : 9) * (1 - near);
    world.style.transform = `scale3d(${k}, ${k}, ${k}) rotateX(${tilt}deg)`;

    // The desk is a flat picture; scale it to stay in step with the props.
    const squash = Math.cos((tilt * Math.PI) / 180) / Math.cos((tiltOpen * Math.PI) / 180);
    desk.style.transform = `scale(${zoom}, ${zoom * squash})`;

    // A shut book lies on one side of its spine, so slide it to keep it centred.
    const half = (vertical ? PAGE_H : PAGE_W) / 2;
    const slide = (closed - (1 - opened)) * half;
    const spin = -9 * (1 - opened) + 7 * closed;
    const late = p > LEAVES / 2;
    book.style.transformOrigin = vertical
      ? (late ? "50% 25%" : "50% 75%")
      : (late ? "25% 50%" : "75% 50%");
    book.style.transform = vertical
      ? `translate3d(0, ${slide}px, 0) rotateZ(${spin}deg)`
      : `translate3d(${slide}px, 0, 0) rotateZ(${spin}deg)`;

    shadowL.style.opacity = opened;
    shadowR.style.opacity = 1 - closed;

    // Turn each leaf, and work out how much light each face loses.
    const turns = leaves.map((_, i) => ease(clamp(p - i, 0, 1)));
    const shadeFront = new Array(LEAVES).fill(0);
    const shadeBack = new Array(LEAVES).fill(0);
    leaves.forEach((leaf, i) => {
      const t = turns[i];
      const angle = t * 180;
      const z = (LEAVES - i) * LIFT + ((i + 1) - (LEAVES - i)) * LIFT * t;
      leaf.style.transform = `translateZ(${z}px) ` + (vertical ? `rotateX(${angle}deg)` : `rotateY(${-angle}deg)`);
      if (t > 0 && t < 1) {
        const sin = Math.sin((angle * Math.PI) / 180);
        const cos = Math.cos((angle * Math.PI) / 180);
        shadeFront[i] += 0.6 * sin;
        shadeBack[i] += 0.5 * sin;
        if (i + 1 < LEAVES) shadeFront[i + 1] += 0.45 * Math.max(0, cos);   // page being uncovered
        if (i > 0) shadeBack[i - 1] += 0.45 * Math.max(0, -cos);             // page being covered
      }
    });
    leaves.forEach((_, i) => {
      fronts[i].style.setProperty("--shade", shadeFront[i].toFixed(3));
      backs[i].style.setProperty("--shade", shadeBack[i].toFixed(3));
    });

    fade(intro, 1 - clamp(p * 3, 0, 1));
    fade(outro, clamp((p - (LEAVES - 0.4)) / 0.4, 0, 1));

    const settled = Math.abs(p - Math.round(p)) < 0.04 ? Math.round(p) : -1;
    if (settled !== spread) settle(settled);
  }

  function fade(el, amount) {
    el.style.opacity = amount;
    el.hidden = amount <= 0.01;
  }

  // Only the two pages facing up can be clicked, focused or read aloud.
  function settle(n) {
    spread = n;
    book.classList.toggle("is-turning", n < 0);
    leaves.forEach((_, i) => {
      const frontUp = n === i;
      const backUp = n === i + 1;
      fronts[i].inert = !frontUp;
      backs[i].inert = !backUp;
      fronts[i].classList.toggle("is-live", frontUp && touchOnly.matches);
      backs[i].classList.toggle("is-live", backUp && touchOnly.matches);
    });
    if (n >= 0) {
      pageLabel.textContent = spreadName(n);
      prevBtn.disabled = n === 0;
      nextBtn.disabled = n === LEAVES;
    }
  }

  function tick() {
    frame = 0;
    const gap = target - current;
    current = reduceMotion.matches || Math.abs(gap) < 0.0006 ? target : current + gap * 0.14;
    render();
    if (current !== target) queue();
  }
  function queue() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  // Scroll to a spread. The glide is timed here rather than left to the
  // browser, so a page turn takes the same time everywhere.
  function goTo(n) {
    rest = clamp(Math.round(n), 0, LEAVES);
    const from = scrollY;
    const to = rest * turn;
    stopGlide();
    if (reduceMotion.matches || Math.abs(to - from) < 2) {
      scrollTo(0, to);
      return;
    }
    const time = clamp(Math.abs(to - from) / turn, 0.5, 1.7) * 640;
    const began = performance.now();
    const step = (now) => {
      const t = clamp((now - began) / time, 0, 1);
      scrollTo(0, from + (to - from) * (1 - Math.pow(1 - t, 3)));
      glide = t < 1 ? requestAnimationFrame(step) : 0;
    };
    glide = requestAnimationFrame(step);
  }
  function stopGlide() {
    cancelAnimationFrame(glide);
    glide = 0;
  }

  // When scrolling stops part-way through a turn, finish it in the direction of travel.
  function snap() {
    if (touching || sheet.open) return;
    const p = clamp(scrollY / turn, 0, LEAVES);
    const nearest = Math.round(p);
    let n = nearest;
    if (Math.abs(p - nearest) >= 0.07) n = p > rest ? Math.ceil(p) : Math.floor(p);
    n = clamp(n, 0, LEAVES);
    rest = n;
    if (Math.abs(p - n) > 0.004) goTo(n);
  }
  function armSnap() {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(snap, 170);
  }

  addEventListener("scroll", () => { readScroll(); queue(); armSnap(); }, { passive: true });
  addEventListener("resize", measure);
  addEventListener("hashchange", () => {
    const link = location.hash.match(/^#spread=([0-9]+)$/);
    if (link) goTo(Number(link[1]));
  });
  addEventListener("wheel", stopGlide, { passive: true });
  addEventListener("touchstart", () => { touching = true; stopGlide(); }, { passive: true });
  addEventListener("touchend", () => { touching = false; armSnap(); }, { passive: true });
  addEventListener("touchcancel", () => { touching = false; armSnap(); }, { passive: true });

  addEventListener("keydown", (e) => {
    if (sheet.open || e.altKey || e.ctrlKey || e.metaKey) return;
    const onControl = e.target.closest && e.target.closest("button, a, input, textarea, select");
    const here = Math.round(target);
    let to = null;
    if (["ArrowRight", "ArrowDown", "PageDown"].includes(e.key)) to = here + 1;
    else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) to = here - 1;
    else if (e.key === " " && !onControl) to = here + (e.shiftKey ? -1 : 1);
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = LEAVES;
    if (to === null) return;
    e.preventDefault();
    goTo(to);
  });

  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) {
      e.preventDefault();
      if (sheet.open) sheet.close();
      goTo(Number(go.dataset.go));
      return;
    }
    const opener = e.target.closest("[data-sheet]");
    if (opener) {
      const notes = $(".notes", opener.parentElement);
      sheetBody.replaceChildren(notes.content.cloneNode(true));
      sheet.showModal();
      return;
    }
    if (e.target === sheet || e.target.closest(".sheet-close")) sheet.close();
  });
  prevBtn.addEventListener("click", () => goTo(Math.round(target) - 1));
  nextBtn.addEventListener("click", () => goTo(Math.round(target) + 1));

  // The succulent: three rings of leaves around the middle of the pot.
  const rosette = $("[data-rosette]");
  const rings = [
    { count: 9, cy: 36, rx: 13, ry: 25, fill: "#5f8f86", turn: 0 },
    { count: 7, cy: 47, rx: 11, ry: 20, fill: "#7fb0a4", turn: 22 },
    { count: 5, cy: 58, rx: 8, ry: 14, fill: "#a6d3c5", turn: 8 },
  ];
  rings.forEach((ring) => {
    for (let i = 0; i < ring.count; i++) {
      const petal = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      petal.setAttribute("cx", 75);
      petal.setAttribute("cy", ring.cy);
      petal.setAttribute("rx", ring.rx);
      petal.setAttribute("ry", ring.ry);
      petal.setAttribute("fill", ring.fill);
      petal.setAttribute("stroke", "#33544f");
      petal.setAttribute("stroke-width", 1);
      petal.setAttribute("transform", `rotate(${ring.turn + (360 / ring.count) * i} 75 75)`);
      rosette.append(petal);
    }
  });
  const heart = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  heart.setAttribute("cx", 75);
  heart.setAttribute("cy", 75);
  heart.setAttribute("r", 7);
  heart.setAttribute("fill", "#c8ebde");
  rosette.append(heart);

  // The book opens at the front cover, or at the spread named in a link
  // such as #spread=3.
  history.scrollRestoration = "manual";
  const linked = location.hash.match(/^#spread=([0-9]+)$/);
  if (linked) rest = clamp(Number(linked[1]), 0, LEAVES);
  measure();
})();