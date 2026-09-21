(function () {
  "use strict";
  const root = document.getElementById("streamdeck-experiment");
  const host = root.querySelector(".model-stage");
  const THREE = window.THREE;
  try {
    const demo = window.streamdexDemo;
    let tasks = demo.buttons(),
      selected = demo.selected,
      mic = true,
      speaker = true,
      voice = false,
      volume = 64,
      frameCount = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 1, 1500);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      document.getElementById("webgl-fallback").hidden = false;
    });
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive Stream Deck Plus with eight animated agent task displays, a touch strip and four rotary dials. Drag to rotate, scroll to zoom, and click a task to select it.",
    );
    const hemi = new THREE.HemisphereLight(0xf7f6ed, 0x717f8b, 2.6);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xfff5e5, 4.8);
    keyLight.position.set(-160, 270, 190);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    Object.assign(keyLight.shadow.camera, {
      left: -220,
      right: 220,
      top: 250,
      bottom: -200,
      near: 1,
      far: 700,
    });
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.6;
    keyLight.shadow.radius = 4;
    scene.add(keyLight);
    const fill = new THREE.DirectionalLight(0xc3deff, 2.1);
    fill.position.set(220, 110, 60);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 2.2);
    rim.position.set(0, 230, -170);
    scene.add(rim);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.ShadowMaterial({ color: 0x354147, opacity: 0.16 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const material = (color, metalness = 0, roughness = 0.65) =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness });
    const shell = material("#171a1d", 0.12, 0.62),
      edge = material("#262a2e", 0.17, 0.49),
      black = material("#090b0d", 0.18, 0.34),
      knobMat = material("#20252a", 0.55, 0.36),
      grooveMat = material("#333940", 0.5, 0.4);
    function shape(w, h, r) {
      const x = -w / 2,
        y = -h / 2;
      const s = new THREE.Shape();
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y);
      s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r);
      s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h);
      s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r);
      s.quadraticCurveTo(x, y, x + r, y);
      return s;
    }
    function rounded(w, h, d, r, mat, bevel = 0.5) {
      const g = new THREE.ExtrudeGeometry(
        shape(w - 2 * bevel, h - 2 * bevel, Math.max(0.2, r - bevel)),
        {
          depth: d - 2 * bevel,
          bevelEnabled: true,
          bevelSegments: 3,
          steps: 1,
          bevelSize: bevel,
          bevelThickness: bevel,
          curveSegments: 12,
        },
      );
      g.translate(0, 0, -d / 2 + bevel);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    }
    const unit = new THREE.Group();
    unit.position.set(0, 87, 22);
    unit.rotation.x = -0.47;
    scene.add(unit);
    const casing = rounded(150, 166, 19, 8, shell, 1.2);
    unit.add(casing);
    const fascia = rounded(146, 162, 1.7, 6.8, edge, 0.3);
    fascia.position.z = 9.8;
    unit.add(fascia);
    const front = rounded(143, 159, 1, 5.5, shell, 0.2);
    front.position.z = 10.8;
    unit.add(front);
    // Back support and rubberized desk foot give the model a physical stance.
    const foot = rounded(146, 112, 6, 10, black, 1);
    foot.rotation.x = -Math.PI / 2;
    foot.position.set(0, 4, 8);
    scene.add(foot);
    const support = new THREE.Mesh(new THREE.BoxGeometry(116, 100, 14), shell);
    support.position.set(0, 52, -30);
    support.rotation.x = -0.22;
    support.castShadow = true;
    scene.add(support);
    const hinge = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 112, 40),
      edge,
    );
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(0, 19, -30);
    hinge.castShadow = true;
    scene.add(hinge);
    function surface(w, h) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      return { canvas, ctx, tex };
    }
    function flatScreen(w, h, tex) {
      return new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          toneMapped: false,
        }),
      );
    }
    const screens = [],
      keyGroups = [],
      pickables = [];
    const xs = [-50.25, -16.75, 16.75, 50.25];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      g.position.set(xs[i % 4], i < 4 ? 49.5 : 15, 11.4);
      unit.add(g);
      keyGroups.push(g);
      const socket = rounded(31.8, 31.8, 1.5, 4, black, 0.3);
      g.add(socket);
      const cap = rounded(29.9, 29.9, 2.1, 3.5, edge, 0.45);
      cap.position.z = 1.2;
      g.add(cap);
      const display = surface(576, 576);
      const m = flatScreen(28.5, 28.5, display.tex);
      m.position.z = 2.31;
      m.userData.keyIndex = i;
      g.add(m);
      pickables.push(m);
      screens.push({ ...display, mesh: m });
    }
    function rr(ctx, x, y, w, h, r, fill) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
    }
    function label(ctx, s, x, y, size, color, weight = 700, align = "center") {
      ctx.font = `${weight} ${size}px Arial`;
      ctx.textAlign = align;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = color;
      ctx.fillText(s, x, y);
    }
    function titleLines(ctx, s) {
      ctx.font = "700 24px Arial";
      let ls = [],
        cur = "";
      for (const word of s.split(" ")) {
        const next = (cur + " " + word).trim();
        if (ctx.measureText(next).width > 120 && cur) {
          ls.push(cur);
          cur = word;
        } else cur = next;
      }
      if (cur) ls.push(cur);
      return ls.slice(0, 2);
    }
    function drawTask(i, time) {
      const { ctx, tex } = screens[i],
        a = tasks[i];
      ctx.setTransform(4, 0, 0, 4, 0, 0);
      ctx.clearRect(0, 0, 144, 144);
      rr(ctx, 0, 0, 144, 144, 12, a.state === "ERROR" ? "#301F25" : "#191B1F");
      const attention = a.state === "INPUT" || a.state === "ERROR",
        pulse = (1 - Math.cos((2 * Math.PI * (time % 2000)) / 2000)) / 2;
      rr(ctx, 4, 4, 136, 136, 10);
      ctx.strokeStyle = a.color;
      ctx.lineWidth = attention ? 4 + 2 * pulse : 3;
      ctx.globalAlpha = attention
        ? 0.72 + 0.28 * pulse
        : a.state === "RUN"
          ? 0.42
          : 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (a.state === "RUN") {
        const circumference = 4 * (116 + (Math.PI * 10) / 2);
        ctx.save();
        rr(ctx, 4, 4, 136, 136, 10);
        ctx.setLineDash([88, circumference - 88]);
        ctx.lineDashOffset = (-(time % 4000) / 4000) * circumference;
        ctx.lineWidth = 3.8;
        ctx.lineCap = "round";
        ctx.strokeStyle = a.color;
        ctx.stroke();
        ctx.restore();
        const step = Math.floor(time / 250) % 8;
        for (let p = 0; p < 8; p++) {
          const angle = (p * Math.PI) / 4 - Math.PI / 2,
            tail = (step - p + 8) % 8;
          ctx.beginPath();
          ctx.moveTo(76 + 4 * Math.cos(angle), 22 + 4 * Math.sin(angle));
          ctx.lineTo(76 + 6.5 * Math.cos(angle), 22 + 6.5 * Math.sin(angle));
          ctx.strokeStyle = a.color;
          ctx.globalAlpha = [1, 0.82, 0.64, 0.48, 0.33, 0.22, 0.16, 0.12][tail];
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      if (i === selected) {
        rr(ctx, 11, 11, 23, 23, 6, "#F4F4F1");
        label(ctx, i + 1, 22.5, 28, 18, "#191B1F");
      } else label(ctx, i + 1, 15, 28, 18, "#A7ADB7", 700, "left");
      label(ctx, a.state, 129, 28, 18, a.color, 700, "right");
      const ls = titleLines(ctx, a.title);
      ls.forEach((l, j) =>
        label(ctx, l, 72, ls.length === 1 ? 79 : 64 + j * 28, 24, "#F4F4F1"),
      );
      label(ctx, a.project, 72, 130, 16, "#A7ADB7", 400);
      tex.needsUpdate = true;
    }
    const strip = surface(1600, 208),
      stripMesh = flatScreen(131.5, 17.1, strip.tex);
    const stripSocket = rounded(134.2, 20.1, 1.8, 3, black, 0.4);
    stripSocket.position.set(0, -13, 11.5);
    unit.add(stripSocket);
    stripMesh.position.set(0, -13, 12.45);
    stripMesh.userData.strip = true;
    unit.add(stripMesh);
    pickables.push(stripMesh);
    function drawStrip(time) {
      const { ctx, tex } = strip;
      ctx.clearRect(0, 0, 1600, 208);
      rr(ctx, 0, 0, 1600, 208, 12, "#111317");
      const headings = demo.dialLabels(),
        labels = demo.touchLabels();
      for (let i = 0; i < 4; i++) {
        if (i) {
          ctx.fillStyle = "#374047";
          ctx.fillRect(i * 400, 15, 2, 178);
        }
        label(ctx, headings[i], i * 400 + 200, 38, 24, "#BFC6D1", 400);
        labels[i].forEach((s, j) => {
          if (i === 3 && j === 1) return;
          const on =
            demo.page === "tasks" && i === 2 && demo.voice
              ? j === 0
                ? demo.mic
                : demo.speaker
              : undefined;
          label(
            ctx,
            s,
            i * 400 + (i === 3 ? 200 : 100 + j * 200),
            136,
            27,
            on === undefined
              ? i === 3
                ? "#8BC9F4"
                : "#F4F4F1"
              : on
                ? "#69E4A6"
                : "#F47F8C",
          );
        });
      }
      tex.needsUpdate = true;
    }
    const knobs = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.position.set(xs[i], -50, 14.5);
      unit.add(g);
      knobs.push(g);
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(10.5, 10.5, 2, 64),
        black,
      );
      collar.rotation.x = Math.PI / 2;
      g.add(collar);
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(8.7, 8.9, 13, 64),
        knobMat,
      );
      body.rotation.x = Math.PI / 2;
      body.position.z = 6.3;
      body.castShadow = true;
      g.add(body);
      for (let k = 0; k < 48; k++) {
        const a = (k * Math.PI * 2) / 48;
        const ridge = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.6, 10.6),
          grooveMat,
        );
        ridge.position.set(Math.cos(a) * 8.8, Math.sin(a) * 8.8, 6.1);
        ridge.rotation.z = a - Math.PI / 2;
        g.add(ridge);
      }
      const face = new THREE.Mesh(
        new THREE.CircleGeometry(8.45, 64),
        material("#282e33", 0.52, 0.33),
      );
      face.position.z = 12.86;
      face.userData.knobIndex = i;
      g.add(face);
      pickables.push(face);
      const notch = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 2.5, 0.1),
        material("#A4ADB5", 0.2, 0.6),
      );
      notch.position.set(0, 5.6, 12.95);
      g.add(notch);
    }
    function lettering(text, w, h, size) {
      const s = surface(1024, 128);
      label(s.ctx, text, 512, 83, size, "#8D959D", 600);
      s.tex.needsUpdate = true;
      return flatScreen(w, h, s.tex);
    }
    const brand = lettering("STREAM DECK +", 59, 7.4, 66);
    brand.position.set(0, 75.5, 11.4);
    unit.add(brand);
    const bottom = lettering("elgato", 22, 2.75, 76);
    bottom.position.set(0, -74, 11.4);
    unit.add(bottom);
    let theta = 0.22,
      phi = 1.04,
      radius = 365;
    const target = new THREE.Vector3(0, 83, 8);
    function view() {
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(target);
    }
    function resize() {
      const w = host.clientWidth,
        h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      view();
    }
    new ResizeObserver(resize).observe(host);
    resize();
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let down = null,
      dragged = false;
    function pick(e) {
      const b = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - b.left) / b.width) * 2 - 1,
        (-(e.clientY - b.top) / b.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(pickables, false)[0];
    }
    renderer.domElement.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY, theta, phi };
      dragged = false;
      renderer.domElement.setPointerCapture(e.pointerId);
    });
    renderer.domElement.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - down.x,
        dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 4) dragged = true;
      if (dragged) {
        theta = down.theta - dx * 0.007;
        phi = Math.max(0.35, Math.min(1.48, down.phi - dy * 0.005));
        view();
      }
    });
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (down && !dragged) {
        const hit = pick(e);
        if (hit) {
          const data = hit.object.userData;
          if (Number.isInteger(data.keyIndex)) {
            demo.pressKey(data.keyIndex);
            const pressed = keyGroups[data.keyIndex];
            pressed.position.z = 10.8;
            setTimeout(() => (pressed.position.z = 11.4), 130);
          }
          if (data.strip) {
            const x = Math.min(0.999, hit.uv.x) * 4;
            demo.touch(Math.floor(x), x % 1 < 0.5 ? "left" : "right");
          }
          if (Number.isInteger(data.knobIndex)) {
            knobs[data.knobIndex].rotation.z += Math.PI / 6;
            demo.pressDial(data.knobIndex);
          }
        }
      }
      down = null;
    });
    renderer.domElement.addEventListener("pointercancel", () => (down = null));
    renderer.domElement.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const hit = pick(e);
        if (Number.isInteger(hit?.object.userData.knobIndex)) {
          demo.turnDial(hit.object.userData.knobIndex, e.deltaY < 0 ? 1 : -1);
          return;
        }
        radius = Math.max(245, Math.min(620, radius + e.deltaY * 0.26));
        view();
      },
      { passive: false },
    );
    // Native controls provide keyboard access without putting toolbars below the visualization.
    root.querySelectorAll("[data-view]").forEach((b) =>
      b.addEventListener("click", () => {
        theta = b.dataset.view === "front" ? 0 : 0.22;
        phi = b.dataset.view === "front" ? 1.1 : 1.04;
        radius = 365;
        view();
      }),
    );
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let last = -999;
    function animate(time) {
      requestAnimationFrame(animate);
      if (document.hidden) return;
      if (time - last >= 125) {
        tasks = demo.buttons();
        selected = demo.page === "tasks" ? demo.selected : -1;
        let clock = reduce.matches || demo.paused ? 1000 : time;
        screens.forEach((_, i) => drawTask(i, clock));
        drawStrip(clock);
        last = time;
        frameCount++;
      }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
    Object.defineProperty(window, "streamdeckPreview", {
      value: {
        get selected() {
          return selected;
        },
        get frameCount() {
          return frameCount;
        },
        get taskStates() {
          return tasks.map((t) => t.state);
        },
        get camera() {
          return { theta, phi, radius };
        },
        get mic() {
          return demo.mic;
        },
        get speaker() {
          return demo.speaker;
        },
      },
    });
  } catch (error) {
    document.getElementById("webgl-fallback").hidden = false;
    console.warn("3D unavailable; accessible controls remain available.");
  }
})();
