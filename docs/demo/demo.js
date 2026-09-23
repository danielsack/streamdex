(() => {
  const $ = (id) => document.getElementById(id),
    colors = {
      RUN: "#58BFFF",
      INPUT: "#F1C56D",
      READY: "#69E4A6",
      ERROR: "#F47F8C",
      SEEN: "#929292",
      IDLE: "#A0A4AE",
    },
    initial = [
      ["Build brief", "Research", "RUN"],
      ["Confirm scope", "Research", "INPUT"],
      ["Review draft", "Writing", "READY"],
      ["Check sources", "Research", "RUN"],
      ["Check access", "Research", "ERROR"],
      ["Choose format", "Reporting", "INPUT"],
      ["Weekly update", "Reporting", "READY"],
      ["Build visual", "Design", "RUN"],
    ];
  const d = (window.streamdexDemo = {
    tasks: [],
    selected: 1,
    page: "tasks",
    voice: false,
    mic: true,
    speaker: true,
    fast: false,
    plan: false,
    dictating: false,
    volume: 64,
    muted: false,
    lightCount: 0,
    lights: [
      { on: true, brightness: 60 },
      { on: true, brightness: 60 },
    ],
    temperature: 4500,
    effort: "medium",
    pending: null,
    offline: false,
    paused: matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  const say = (s) => {
    $("announcement").textContent = s;
  };
  const selected = () => d.tasks[d.selected];
  function app(message, respond = false) {
    $("app-message").textContent = message;
    $("respond").hidden = !respond;
  }
  const key = (title, sub, run, color = "#A7ADB7") => ({
    title,
    project: sub,
    state: "",
    color,
    run,
  });
  d.buttons = () =>
    d.page === "tasks"
      ? d.tasks
      : [
          key("Voice", d.voice ? "ON" : "OFF", () => d.touch(0, "left")),
          key("Dictate", d.dictating ? "RECORDING" : "SIMULATED", () =>
            d.touch(0, "right"),
          ),
          key("Fast", d.fast ? "ON" : "OFF", () => {
            d.fast = !d.fast;
            say(
              "Fast " +
                (d.fast ? "on" : "off") +
                " for the selected fictional task.",
            );
          }),
          key("Plan", d.plan ? "ON" : "OFF", () => {
            d.plan = !d.plan;
            say(
              "Plan " +
                (d.plan ? "on" : "off") +
                " for the selected fictional task.",
            );
          }),
          key("Quick chat", "OPEN", () =>
            app("A simulated Quick chat would open."),
          ),
          key("New task", "OPEN", () =>
            app("A simulated new-task composer would open."),
          ),
          key("Volume −", d.volume + "%", () => d.turnDial(3, -1)),
          key("Volume +", d.volume + "%", () => d.turnDial(3, 1)),
        ];
  d.context = () => {
    const s = selected().state;
    return s === "INPUT"
      ? ["Question", "Options"]
      : s === "RUN"
        ? ["Stop", "Output"]
        : ["Open task", "Review"];
  };
  d.touchLabels = () =>
    d.page === "tasks"
      ? [
          [
            d.voice ? "Voice on" : "Voice off",
            d.dictating ? "Stop mic" : "Dictate",
          ],
          d.context(),
          d.voice
            ? [d.mic ? "Mic on" : "Mic muted", d.speaker ? "Sound on" : "Muted"]
            : ["Quick chat", "New task"],
          ["More →", "More →"],
        ]
      : [
          ["Light info", "Light info"],
          ["Light info", "Light info"],
          [d.fast ? "Fast on" : "Fast", d.plan ? "Plan on" : "Plan"],
          ["← Tasks", "← Tasks"],
        ];
  d.dialLabels = () =>
    [0, 1]
      .map((i) =>
        i >= d.lightCount
          ? "Unassigned"
          : d.offline
            ? "Light " + (i + 1) + " offline"
            : "Light " +
              (i + 1) +
              " · " +
              (d.lights[i].on ? d.lights[i].brightness + "%" : "OFF"),
      )
      .concat(
        d.lightCount
          ? "Temperature · " + d.temperature + " K"
          : d.pending
            ? "Preview · " + d.pending
            : "Reasoning · " + d.effort,
        "Volume · " + (d.muted ? "MUTED" : d.volume + "%"),
      );
  d.pressKey = (i) => {
    if (d.page === "more") {
      d.buttons()[i].run();
      render();
      return;
    }
    d.selected = i;
    d.pending = null;
    openTask();
    render();
  };
  function openTask() {
    const t = selected();
    if (t.state === "READY") {
      t.state = "SEEN";
      t.color = colors.SEEN;
    }
    if (t.state === "INPUT")
      app(
        "The task asks: " +
          (d.selected === 5
            ? "Which format should I use?"
            : "Which audience should the brief address?"),
        true,
      );
    else if (t.state === "ERROR")
      app(
        "This fictional task could not access a source. Inspect and resolve the problem in Codex; the deck does not retry it automatically.",
      );
    else app("Opened the simulated " + t.title + " conversation.");
    say("Opened " + t.title + ".");
  }
  d.touch = (column, side) => {
    if (column === 3) {
      d.page = d.page === "tasks" ? "more" : "tasks";
      say("Showing " + d.page + ".");
    } else if (d.page === "more") {
      if (column === 2) {
        if (side === "left") d.fast = !d.fast;
        else d.plan = !d.plan;
        say(
          "Changed the selected task’s " +
            (side === "left" ? "Fast" : "Plan") +
            " mode.",
        );
      } else
        say(
          "The upper strip reports your configured lights. Rotate a dial to adjust one.",
        );
    } else if (column === 0) {
      if (side === "left") {
        d.voice = !d.voice;
        d.dictating = false;
        say(
          d.voice
            ? "Live Voice simulated. Mic and speaker controls are now available."
            : "Voice ended. Quick chat and New task return.",
        );
      } else {
        d.dictating = !d.dictating;
        app(
          d.dictating
            ? "Simulated dictation is recording. No real microphone is used."
            : "A simulated draft is ready in Codex. Review it before sending.",
        );
      }
    } else if (column === 1) {
      if (selected().state === "RUN" && side === "left") {
        selected().state = "IDLE";
        selected().color = colors.IDLE;
        say("Interrupted the fictional running task.");
      } else if (
        side === "right" &&
        !["INPUT", "RUN"].includes(selected().state)
      ) {
        app("The selected task’s review panel would open in Codex.");
        say("Opened review for " + selected().title + ".");
      } else openTask();
    } else if (column === 2) {
      if (d.voice) {
        if (side === "left") d.mic = !d.mic;
        else d.speaker = !d.speaker;
        say(
          (side === "left" ? "Voice microphone" : "Agent audio") +
            " " +
            ((side === "left" ? d.mic : d.speaker) ? "enabled." : "muted."),
        );
      } else
        app(
          side === "left"
            ? "A simulated Quick chat would open."
            : "A simulated new-task composer would open.",
        );
    }
    render();
  };
  d.turnDial = (i, delta) => {
    if (i < 2) {
      if (i >= d.lightCount) {
        say("This dial is unassigned in the no-light preset.");
        return;
      }
      if (d.offline) {
        say("Light offline. Its assignment stays the same.");
        return;
      }
      d.lights[i].brightness = Math.max(
        0,
        Math.min(100, d.lights[i].brightness + delta * 5),
      );
    } else if (i === 2) {
      if (d.lightCount) {
        if (d.offline) {
          say("Lights offline. The dial keeps its lighting assignment.");
          return;
        }
        d.temperature = Math.max(
          2900,
          Math.min(7000, d.temperature + delta * 100),
        );
      } else {
        const levels = ["low", "medium", "high", "xhigh"];
        d.pending =
          levels[
            Math.max(
              0,
              Math.min(3, levels.indexOf(d.pending || d.effort) + delta),
            )
          ];
        say(
          "Preview " +
            d.pending +
            ". Press the dial to apply to " +
            selected().title +
            ".",
        );
      }
    } else d.volume = Math.max(0, Math.min(100, d.volume + delta * 5));
    render();
  };
  d.pressDial = (i) => {
    if (i < 2) {
      if (i >= d.lightCount || d.offline) {
        say(i >= d.lightCount ? "Dial unassigned." : "Light offline.");
        return;
      }
      d.lights[i].on = !d.lights[i].on;
    } else if (i === 2) {
      if (d.lightCount) {
        say("Rotate this dial to change light temperature.");
        return;
      }
      if (!d.pending) {
        say("Rotate to preview reasoning first.");
        return;
      }
      d.effort = d.pending;
      d.pending = null;
      say(
        "Applied " +
          d.effort +
          " reasoning to " +
          selected().title +
          ". The model stays the same.",
      );
    } else d.muted = !d.muted;
    render();
  };
  function render() {
    const focused = document.activeElement?.dataset.control;
    $("page-title").textContent = d.page === "tasks" ? "Tasks" : "More";
    $("selected-title").textContent = selected().title;
    $("selected-status").textContent = selected().state;
    $("selected-status").style.color = selected().color;
    $("selected-description").textContent = {
      INPUT: "A blocking question or approval takes priority over running activity.",
      RUN: "The agent is working. Motion signals activity, not percentage complete.",
      READY: "A completed response is waiting to be opened.",
      ERROR: "Open the task to inspect the problem.",
      SEEN: "Opened, not necessarily reviewed or approved.",
      IDLE: "The task is idle. Continue the conversation in Codex.",
    }[selected().state];
    $("keys").replaceChildren(
      ...d.buttons().map((t, i) => {
        const b = document.createElement("button");
        b.className = "task-key";
        b.dataset.control = "key-" + i;
        b.style.setProperty("--status", t.color);
        b.dataset.state = t.state;
        b.setAttribute(
          "aria-label",
          d.page === "tasks"
            ? `Task ${i + 1}: ${t.title}, ${t.state}, ${t.project}`
            : t.title,
        );
        b.setAttribute(
          "aria-pressed",
          String(d.page === "tasks" && i === d.selected),
        );
        const h = document.createElement("span");
        h.className = "key-head";
        const n = document.createElement("span");
        n.textContent = i + 1;
        const st = document.createElement("span");
        st.textContent = t.state;
        h.append(n, st);
        const title = document.createElement("b");
        title.textContent = t.title;
        const sub = document.createElement("small");
        sub.textContent = t.project;
        b.append(h, title, sub);
        b.onclick = () => d.pressKey(i);
        return b;
      }),
    );
    $("touch").replaceChildren(
      ...d.touchLabels().map((labels, col) => {
        const el = document.createElement("div");
        el.className = "segment";
        labels.forEach((label, index) => {
          if (col === 3 && index === 1) return;
          const b = document.createElement("button");
          b.textContent = label;
          b.dataset.control = "touch-" + col + "-" + index;
          if (col === 3) b.style.gridColumn = "span 2";
          if (col === 2 && d.page === "tasks" && d.voice) {
            const on = index === 0 ? d.mic : d.speaker;
            b.setAttribute("aria-pressed", String(!on));
            b.setAttribute(
              "aria-label",
              (index === 0 ? "Voice microphone" : "Agent audio") +
                (on ? " on (mute)" : " muted (unmute)"),
            );
            b.style.setProperty("--ink", on ? colors.READY : colors.ERROR);
          }
          b.onclick = () => d.touch(col, index ? "right" : "left");
          el.append(b);
        });
        return el;
      }),
    );
    $("dials").replaceChildren(
      ...d.dialLabels().map((label, i) => {
        const box = document.createElement("div");
        box.className = "dial";
        const p = document.createElement("p");
        p.textContent = label;
        const row = document.createElement("div");
        ["−", "Press", "+"].forEach((s, j) => {
          const b = document.createElement("button");
          b.textContent = s;
          b.dataset.control = "dial-" + i + "-" + j;
          b.setAttribute(
            "aria-label",
            `Dial ${i + 1} ${j === 1 ? "press" : j === 0 ? "decrease" : "increase"} (${label})`,
          );
          b.disabled = i < 2 && i >= d.lightCount;
          b.onclick = () =>
            j === 1 ? d.pressDial(i) : d.turnDial(i, j === 0 ? -1 : 1);
          row.append(b);
        });
        box.append(p, row);
        return box;
      }),
    );
    $("motion").textContent = d.paused ? "Resume motion" : "Pause motion";
    $("motion").setAttribute("aria-pressed", String(d.paused));
    if (focused)
      document
        .querySelector('[data-control="' + focused + '"]')
        ?.focus({ preventScroll: true });
  }
  function reset() {
    document
      .querySelectorAll("[data-scenario]")
      .forEach((x) => x.setAttribute("aria-pressed", "false"));
    d.tasks = initial.map(([title, project, state]) => ({
      title,
      project,
      state,
      color: colors[state],
    }));
    Object.assign(d, {
      selected: 1,
      page: "tasks",
      voice: false,
      mic: true,
      speaker: true,
      dictating: false,
      fast: false,
      plan: false,
      volume: 64,
      muted: false,
      lightCount: 0,
      offline: false,
      temperature: 4500,
      effort: "medium",
      pending: null,
      lights: [
        { on: true, brightness: 60 },
        { on: true, brightness: 60 },
      ],
    });
    $("lighting").value = "0";
    $("offline").checked = false;
    app("No app is connected. All tasks and interactions are fictional.");
    say("Demo reset. No changes made to apps or hardware.");
    render();
  }
  document.querySelectorAll("[data-scenario]").forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll("[data-scenario]")
          .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        d.page = "tasks";
        d.selected = { input: 1, ready: 2, error: 4, voice: 0 }[
          b.dataset.scenario
        ];
        if (["ready", "input", "error"].includes(b.dataset.scenario)) {
          selected().state = { ready: "READY", input: "INPUT", error: "ERROR" }[
            b.dataset.scenario
          ];
          selected().color = colors[selected().state];
        }
        if (b.dataset.scenario === "voice") {
          d.voice = true;
          d.mic = true;
          d.speaker = true;
          app(
            "Use the mic and speaker controls below. Each can be muted independently.",
          );
        } else {
          d.voice = false;
          app("Select Question, Open task, or Review on the touch strip.");
        }
        d.pending = null;
        render();
        say("Scenario: " + b.textContent.trim());
      }),
  );
  $("respond").onclick = () => {
    selected().state = "RUN";
    selected().color = colors.RUN;
    app(
      "Your fictional answer was sent in the simulated app. The agent resumes.",
    );
    say("Answer sent in the simulated app. Task now RUN.");
    render();
  };
  $("lighting").onchange = (e) => {
    d.lightCount = Number(e.target.value);
    d.pending = null;
    render();
    say(
      d.lightCount
        ? "Lighting preset selected."
        : "No-light preset selected. Dial 3 previews reasoning.",
    );
  };
  $("offline").onchange = (e) => {
    d.offline = e.target.checked;
    render();
  };
  $("motion").onclick = () => {
    d.paused = !d.paused;
    render();
  };
  $("reset").onclick = reset;
  d.render = render;
  reset();
})();
