// LilOS — apps/calculator.js
// A standard four-function calculator. No eval() — operations are applied
// directly as the user presses keys, like a real pocket calculator.

function apply(op, a, b) {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return b === 0 ? NaN : a / b;
    default: return b;
  }
}

function formatNum(n) {
  if (Number.isNaN(n)) return "Error";
  if (!Number.isFinite(n)) return "Error";
  const s = Math.abs(n) < 1e15 ? String(Math.round(n * 1e10) / 1e10) : n.toExponential(6);
  return s;
}

export const calculatorApp = {
  id: "calculator",
  name: "Calculator",
  icon: "🧮",
  width: 300,
  height: 440,
  minWidth: 280,
  minHeight: 420,
  singleton: false,

  mount(container) {
    let display = "0";
    let stored = null;
    let pendingOp = null;
    let overwrite = true;
    let exprLabel = "";

    container.innerHTML = `
      <div class="calc-wrap">
        <div class="calc-expr" id="calc-expr"></div>
        <div class="calc-display" id="calc-display">0</div>
        <div class="calc-grid">
          <button class="calc-btn fn" data-k="clear">C</button>
          <button class="calc-btn fn" data-k="sign">±</button>
          <button class="calc-btn fn" data-k="percent">%</button>
          <button class="calc-btn op" data-k="÷">÷</button>

          <button class="calc-btn" data-k="7">7</button>
          <button class="calc-btn" data-k="8">8</button>
          <button class="calc-btn" data-k="9">9</button>
          <button class="calc-btn op" data-k="×">×</button>

          <button class="calc-btn" data-k="4">4</button>
          <button class="calc-btn" data-k="5">5</button>
          <button class="calc-btn" data-k="6">6</button>
          <button class="calc-btn op" data-k="-">-</button>

          <button class="calc-btn" data-k="1">1</button>
          <button class="calc-btn" data-k="2">2</button>
          <button class="calc-btn" data-k="3">3</button>
          <button class="calc-btn op" data-k="+">+</button>

          <button class="calc-btn zero" data-k="0">0</button>
          <button class="calc-btn" data-k=".">.</button>
          <button class="calc-btn op" data-k="=">=</button>
        </div>
      </div>`;

    const displayEl = container.querySelector("#calc-display");
    const exprEl = container.querySelector("#calc-expr");

    function render() {
      displayEl.textContent = display;
      exprEl.textContent = exprLabel;
    }

    function inputDigit(d) {
      if (overwrite || display === "0") {
        display = d;
        overwrite = false;
      } else if (display.length < 15) {
        display += d;
      }
    }

    function inputDot() {
      if (overwrite) {
        display = "0.";
        overwrite = false;
        return;
      }
      if (!display.includes(".")) display += ".";
    }

    function chooseOp(op) {
      const current = parseFloat(display);
      if (pendingOp && !overwrite) {
        stored = apply(pendingOp, stored, current);
        display = formatNum(stored);
      } else {
        stored = current;
      }
      pendingOp = op;
      exprLabel = `${formatNum(stored)} ${op}`;
      overwrite = true;
    }

    function equals() {
      if (pendingOp == null) return;
      const current = parseFloat(display);
      const result = apply(pendingOp, stored, current);
      exprLabel = `${formatNum(stored)} ${pendingOp} ${formatNum(current)} =`;
      display = formatNum(result);
      stored = null;
      pendingOp = null;
      overwrite = true;
    }

    container.querySelector(".calc-grid").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const k = btn.dataset.k;
      if (/^[0-9]$/.test(k)) inputDigit(k);
      else if (k === ".") inputDot();
      else if (["+", "-", "×", "÷"].includes(k)) chooseOp(k);
      else if (k === "=") equals();
      else if (k === "clear") {
        display = "0"; stored = null; pendingOp = null; overwrite = true; exprLabel = "";
      } else if (k === "sign") {
        display = formatNum(parseFloat(display) * -1);
      } else if (k === "percent") {
        display = formatNum(parseFloat(display) / 100);
      }
      render();
    });

    container.tabIndex = 0;
    container.addEventListener("keydown", (e) => {
      if (/^[0-9]$/.test(e.key)) inputDigit(e.key);
      else if (e.key === ".") inputDot();
      else if (["+", "-"].includes(e.key)) chooseOp(e.key);
      else if (e.key === "*") chooseOp("×");
      else if (e.key === "/") chooseOp("÷");
      else if (e.key === "Enter" || e.key === "=") equals();
      else if (e.key === "Backspace") display = display.length > 1 ? display.slice(0, -1) : "0";
      else if (e.key === "Escape") { display = "0"; stored = null; pendingOp = null; overwrite = true; exprLabel = ""; }
      else return;
      e.preventDefault();
      render();
    });

    render();
  },
};
