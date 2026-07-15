const input = document.getElementById("path-input");
    const send = document.getElementById("send");
    const output = document.getElementById("output");
    const status = document.getElementById("resp-status");
    const time = document.getElementById("resp-time");
    const copyBtn = document.getElementById("copy");
    let lastJson = "";

    async function run() {
      const path = input.value.replace(/^\/+/, "");
      const url = "/geo/v1/" + path;
      status.textContent = "…";
      status.className = "badge";
      time.textContent = "";
      output.innerHTML = "<code>Loading " + escapeHtml(url) + "</code>";

      const started = performance.now();
      try {
        const res = await fetch(url);
        const ms = Math.round(performance.now() - started);
        const json = await res.json();
        lastJson = JSON.stringify(json, null, 2);

        status.textContent = res.status + " " + (res.ok ? "OK" : res.statusText || "Error");
        status.className = "badge " + (res.ok ? "ok" : "err");
        time.textContent = ms + " ms · " + (res.headers.get("X-Cache") === "HIT" ? "cached" : "fresh");
        output.innerHTML = "<code>" + highlight(lastJson) + "</code>";
        copyBtn.hidden = false;
      } catch (e) {
        status.textContent = "Network error";
        status.className = "badge err";
        output.innerHTML = "<code>Could not reach the API. If you opened this file directly, run the server first: npm start</code>";
        copyBtn.hidden = true;
      }
    }

    function escapeHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function highlight(json) {
      return escapeHtml(json).replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
        (match) => {
          let cls = "num";
          if (/^"/.test(match)) cls = /:$/.test(match) ? "key" : "str";
          else if (/true|false/.test(match)) cls = "bool";
          else if (/null/.test(match)) cls = "null";
          return '<span class="' + cls + '">' + match + "</span>";
        }
      );
    }

    send.addEventListener("click", run);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });

    document.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        input.value = chip.dataset.path;
        run();
      });
    });

    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(lastJson);
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy JSON"), 1500);
    });

    // Show the real base URL of wherever this is deployed.
    document.getElementById("base-url").textContent = "/geo/v1/";

    // First load
    run();
