// LilOS — apps/terminal.js
// A safe, simulated shell. It never touches the user's real computer —
// every command below operates only on the LilOS virtual filesystem.

import * as vfs from "../filesystem/vfs.js";
import { escapeHtml, formatBytes } from "../core/utils.js";

function tokenize(line) {
  const tokens = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === " ") {
      if (cur) { tokens.push(cur); cur = ""; }
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

const HELP_TEXT = `LilOS terminal — virtual commands (sandboxed, no real system access)

  help              show this help
  clear             clear the screen
  pwd               print working directory
  ls [path]         list a directory
  cd [path]         change directory (".." goes up)
  mkdir <name>      create a folder
  touch <name>      create an empty file
  cat <file>        print a file's contents
  echo <text>       print text (supports > file and >> file)
  cp <src> <dest>   copy a file or folder
  mv <src> <dest>   move or rename a file or folder
  rm <name>         remove a file
  rmdir <name>      remove an empty folder
  find <text>       search the whole filesystem by name
  tree              print the tree from here
  whoami            print current user
  hostname          print device name
  date              print the current date and time
  uname             print system info
  neofetch          fancy system summary
  history           show command history`;

export const terminalApp = {
  id: "terminal",
  name: "Terminal",
  icon: "⌥",
  width: 620,
  height: 420,
  singleton: false,

  async mount(container, winApi, ctx) {
    let cwdId = vfs.ROOT_ID;
    const cmdHistory = [];
    let historyPos = -1;

    container.innerHTML = `
      <div class="term-body scrollpane" id="term-output"></div>
      <div class="term-body" style="flex:0 0 auto; padding-top:0;">
        <div class="term-row">
          <span class="term-prompt" id="term-prompt-label"></span>
          <div class="term-input-row" style="flex:1;display:flex;">
            <input id="term-input" autocomplete="off" spellcheck="false" />
          </div>
        </div>
      </div>`;

    const outputEl = container.querySelector("#term-output");
    const inputEl = container.querySelector("#term-input");
    const promptLabel = container.querySelector("#term-prompt-label");

    function print(text, cls = "") {
      const line = document.createElement("div");
      line.className = `term-line ${cls}`;
      line.textContent = text;
      outputEl.appendChild(line);
      outputEl.scrollTop = outputEl.scrollHeight;
    }

    async function updatePrompt() {
      const path = await vfs.getPath(cwdId);
      promptLabel.textContent = `guest@lilos:${path === "/" ? "/" : path}$`;
    }

    async function resolveArg(arg) {
      return vfs.resolvePath(arg, cwdId);
    }

    async function cmd_ls(args) {
      const target = args[0] ? await resolveArg(args[0]) : await vfs.getNode(cwdId);
      if (!target) return { error: `ls: ${args[0]}: no such file or directory` };
      if (target.type === "file") return { output: target.name };
      const children = await vfs.getChildren(target.id);
      if (!children.length) return { output: "" };
      return { output: children.map((c) => (c.type === "folder" ? `${c.name}/` : c.name)).join("  ") };
    }

    async function cmd_cd(args) {
      if (!args[0]) { cwdId = vfs.ROOT_ID; return {}; }
      const target = await resolveArg(args[0]);
      if (!target) return { error: `cd: ${args[0]}: no such directory` };
      if (target.type !== "folder") return { error: `cd: ${args[0]}: not a directory` };
      cwdId = target.id;
      return {};
    }

    async function cmd_mkdir(args) {
      if (!args[0]) return { error: "mkdir: missing operand" };
      try { await vfs.createFolder(cwdId, args[0]); return {}; }
      catch (e) { return { error: `mkdir: ${e.message}` }; }
    }

    async function cmd_touch(args) {
      if (!args[0]) return { error: "touch: missing operand" };
      const existing = await resolveArg(args[0]);
      if (existing) { await vfs.writeFile(existing.id, existing.content || ""); return {}; }
      try { await vfs.createFile(cwdId, args[0], ""); return {}; }
      catch (e) { return { error: `touch: ${e.message}` }; }
    }

    async function cmd_cat(args) {
      if (!args[0]) return { error: "cat: missing operand" };
      const node = await resolveArg(args[0]);
      if (!node) return { error: `cat: ${args[0]}: no such file` };
      if (node.type !== "file") return { error: `cat: ${args[0]}: is a directory` };
      return { output: node.content || "" };
    }

    async function cmd_echo(args, redirectTarget) {
      const text = args.join(" ");
      if (redirectTarget) return { output: text, silent: true };
      return { output: text };
    }

    async function cmd_rm(args) {
      if (!args[0]) return { error: "rm: missing operand" };
      const node = await resolveArg(args[0]);
      if (!node) return { error: `rm: ${args[0]}: no such file` };
      if (node.type === "folder" && !args.includes("-r")) return { error: `rm: ${args[0]}: is a directory (use rmdir, or "rm -r")` };
      await vfs.deleteNode(node.id);
      return {};
    }

    async function cmd_rmdir(args) {
      if (!args[0]) return { error: "rmdir: missing operand" };
      const node = await resolveArg(args[0]);
      if (!node) return { error: `rmdir: ${args[0]}: no such directory` };
      if (node.type !== "folder") return { error: `rmdir: ${args[0]}: not a directory` };
      const kids = await vfs.getChildren(node.id);
      if (kids.length) return { error: `rmdir: ${args[0]}: directory not empty` };
      await vfs.deleteNode(node.id);
      return {};
    }

    async function cmd_cp(args) {
      if (args.length < 2) return { error: "cp: usage: cp <source> <dest>" };
      const src = await resolveArg(args[0]);
      if (!src) return { error: `cp: ${args[0]}: no such file or directory` };
      const dest = await resolveArg(args[1]);
      try {
        if (dest && dest.type === "folder") await vfs.copyNode(src.id, dest.id);
        else {
          const copy = await vfs.copyNode(src.id, cwdId);
          await vfs.rename(copy.id, args[1].split("/").pop());
        }
        return {};
      } catch (e) { return { error: `cp: ${e.message}` }; }
    }

    async function cmd_mv(args) {
      if (args.length < 2) return { error: "mv: usage: mv <source> <dest>" };
      const src = await resolveArg(args[0]);
      if (!src) return { error: `mv: ${args[0]}: no such file or directory` };
      const dest = await resolveArg(args[1]);
      try {
        if (dest && dest.type === "folder") await vfs.moveNode(src.id, dest.id);
        else await vfs.rename(src.id, args[1].split("/").pop());
        return {};
      } catch (e) { return { error: `mv: ${e.message}` }; }
    }

    async function cmd_find(args) {
      if (!args[0]) return { error: "find: missing search text" };
      const matches = await vfs.search(args[0], vfs.ROOT_ID);
      if (!matches.length) return { output: "No matches." };
      const paths = await Promise.all(matches.map((m) => vfs.getPath(m.id)));
      return { output: paths.join("\n") };
    }

    async function cmd_tree() {
      const root = await vfs.tree(cwdId);
      const lines = [];
      function walk(node, prefix) {
        lines.push(prefix + (prefix ? node.node.name : node.node.name + "/"));
        node.children.forEach((c, i) => walk(c, prefix + "  "));
      }
      walk(root, "");
      return { output: lines.join("\n") };
    }

    async function cmd_neofetch() {
      const { bytes, files, folders } = await vfs.storageUsage();
      const art = [
        "     .-.     ",
        "    (o.o)    ",
        "     |=|     ",
        "    __|__    ",
        "  //.=|=.\\\\  ",
      ];
      const info = [
        `guest@lilos`,
        `-----------`,
        `OS: LilOS Web Edition`,
        `Kernel: browser-vm 1.0`,
        `Shell: lilsh`,
        `Files: ${files}  Folders: ${folders}`,
        `Storage used: ${formatBytes(bytes)}`,
        `Display: ${window.screen.width}x${window.screen.height}`,
      ];
      const lines = [];
      for (let i = 0; i < Math.max(art.length, info.length); i++) {
        lines.push(`${(art[i] || "").padEnd(14)} ${info[i] || ""}`);
      }
      return { output: lines.join("\n") };
    }

    const HANDLERS = {
      help: async () => ({ output: HELP_TEXT }),
      pwd: async () => ({ output: await vfs.getPath(cwdId) }),
      ls: cmd_ls,
      cd: cmd_cd,
      mkdir: cmd_mkdir,
      touch: cmd_touch,
      cat: cmd_cat,
      echo: cmd_echo,
      cp: cmd_cp,
      mv: cmd_mv,
      rm: cmd_rm,
      rmdir: cmd_rmdir,
      find: cmd_find,
      tree: cmd_tree,
      whoami: async () => ({ output: "guest" }),
      hostname: async () => ({ output: "lilos" }),
      date: async () => ({ output: new Date().toString() }),
      uname: async () => ({ output: `LilOS ${ctx.settings.get("version")} (sandboxed browser virtual machine)` }),
      neofetch: cmd_neofetch,
      history: async () => ({ output: cmdHistory.map((c, i) => `${i + 1}  ${c}`).join("\n") }),
    };

    async function runLine(raw) {
      const line = raw.trim();
      if (!line) return;
      cmdHistory.push(line);
      historyPos = cmdHistory.length;

      await updatePrompt();
      print(`${promptLabel.textContent} ${raw}`, "sys");

      if (line === "clear") { outputEl.innerHTML = ""; return; }

      let tokens = tokenize(line);
      let redirectFile = null;
      let append = false;
      const gtIdx = tokens.indexOf(">");
      const gtgtIdx = tokens.indexOf(">>");
      if (gtgtIdx !== -1) { redirectFile = tokens[gtgtIdx + 1]; append = true; tokens = tokens.slice(0, gtgtIdx); }
      else if (gtIdx !== -1) { redirectFile = tokens[gtIdx + 1]; tokens = tokens.slice(0, gtIdx); }

      const [command, ...args] = tokens;
      if (!command) return;
      const handler = HANDLERS[command];
      if (!handler) { print(`command not found: ${command}. Type "help" for a list.`, "err"); return; }

      let result;
      try {
        result = await handler(args, redirectFile);
      } catch (e) {
        result = { error: e.message };
      }

      if (redirectFile && result && result.output != null) {
        const existing = await resolveArg(redirectFile);
        const content = append && existing ? `${existing.content || ""}${result.output}\n` : `${result.output}\n`;
        if (existing) await vfs.writeFile(existing.id, content);
        else await vfs.createFile(cwdId, redirectFile, content).catch((e) => print(e.message, "err"));
        await updatePrompt();
        return;
      }

      if (result?.error) print(result.error, "err");
      else if (result?.output != null && !result.silent) print(result.output);
      await updatePrompt();
    }

    inputEl.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        const val = inputEl.value;
        inputEl.value = "";
        await runLine(val);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (historyPos > 0) { historyPos--; inputEl.value = cmdHistory[historyPos] || ""; }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyPos < cmdHistory.length) { historyPos++; inputEl.value = cmdHistory[historyPos] || ""; }
      }
    });

    container.addEventListener("click", () => inputEl.focus());

    print("LilOS terminal — sandboxed virtual shell. Type \"help\" to get started.", "sys");
    await updatePrompt();
    setTimeout(() => inputEl.focus(), 50);
  },
};
