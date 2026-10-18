/**
 * Utilitários PUROS da guarda (sem E/S): tokenizador de shell para Bash e PowerShell, desembrulho de invólucros
 * (sudo, env, bash -c, pwsh -Command, cmd /c, xargs...), normalização de caminhos do Windows e matcher de glob.
 * Não é um interpretador de shell completo: cobre as formas comuns e erra para o lado de VER MAIS comandos.
 * Limites conhecidos (variáveis, scripts em arquivo, eval dinâmico) estão no README.
 */

/**
 * Comando cru: palavras já sem aspas, mais os alvos de redirecionamento de saída (>, >>) e de entrada (<),
 * os corpos de heredoc que ele recebe (`here`) e se veio logo depois de um `|` (`piped`).
 */
export interface RawCmd {
  words: string[];
  out: string[];
  inp: string[];
  here: string[];
  piped: boolean;
}

/** Comando resolvido: `name` = nome base em minúsculas, sem diretório nem extensão (.exe, .cmd, .bat, .ps1). */
export interface Cmd {
  name: string;
  args: string[];
  out: string[];
  inp: string[];
}

interface Heredoc {
  tag: string;
  strip: boolean;
  end: number;
  owner?: RawCmd;
}

const newCmd = (piped: boolean): RawCmd => ({ words: [], out: [], inp: [], here: [], piped });

const MAX_DEPTH = 4;

/** Lê `<<[-]TAG` em `i`; devolve a etiqueta e o índice logo após ela, ou null. */
function readHeredoc(src: string, i: number): Heredoc | null {
  let j = i + 2;
  let strip = false;
  if (src.charAt(j) === "-") {
    strip = true;
    j++;
  }
  while (src.charAt(j) === " " || src.charAt(j) === "\t") j++;
  const q = src.charAt(j);
  if (q === "'" || q === '"') {
    const k = src.indexOf(q, j + 1);
    if (k < 0) return null;
    return { tag: src.slice(j + 1, k), strip, end: k + 1 };
  }
  const m = /^[A-Za-z0-9_]+/.exec(src.slice(j, j + 64));
  if (m === null) return null;
  return { tag: m[0], strip, end: j + m[0].length };
}

/** Lê o corpo de um heredoc: `next` = índice logo após a linha terminadora (ou o fim do texto), `body` = as linhas antes dela. */
function skipBody(src: string, from: number, h: Heredoc): { next: number; body: string } {
  const n = src.length;
  let i = from;
  while (i < n) {
    let e = src.indexOf("\n", i);
    if (e < 0) e = n;
    let line = src.slice(i, e);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (h.strip) line = line.replace(/^\t+/, "");
    const lineStart = i;
    i = e + 1;
    if (line === h.tag) return { next: Math.min(i, n), body: src.slice(from, lineStart) };
  }
  return { next: n, body: src.slice(from) };
}

/** Pula uma string entre aspas duplas (já dentro dela); respeita `$( ... )` aninhado. */
function skipDq(src: string, from: number, ps: boolean, lvl: number): number {
  const n = src.length;
  let i = from;
  while (i < n) {
    const c = src.charAt(i);
    if (c === '"') return i + 1;
    if ((c === "\\" && !ps) || (c === "`" && ps)) {
      i += 2;
      continue;
    }
    if (c === "$" && src.charAt(i + 1) === "(") {
      i = matchParen(src, i + 2, ps, lvl + 1).next;
      continue;
    }
    i++;
  }
  return n;
}

/** Acha o `)` que fecha uma substituição; `from` fica logo após `$(`. Entende aspas e heredocs. */
function matchParen(src: string, from: number, ps: boolean, lvl = 0): { inner: string; next: number } {
  const n = src.length;
  // aninhamento absurdo (entrada patológica): trata o resto como a substituição, sem estourar a pilha
  if (lvl > 40) return { inner: src.slice(from), next: n };
  let depth = 1;
  let i = from;
  let pend: Heredoc[] = [];
  while (i < n) {
    const c = src.charAt(i);
    if (c === "'") {
      const k = src.indexOf("'", i + 1);
      i = k < 0 ? n : k + 1;
      continue;
    }
    if (c === '"') {
      i = skipDq(src, i + 1, ps, lvl);
      continue;
    }
    if ((c === "\\" && !ps) || (c === "`" && ps)) {
      i += 2;
      continue;
    }
    if (c === "\n") {
      i++;
      for (const h of pend) i = skipBody(src, i, h).next;
      pend = [];
      continue;
    }
    if (!ps && c === "<" && src.charAt(i + 1) === "<" && src.charAt(i + 2) !== "<") {
      const h = readHeredoc(src, i);
      if (h !== null) {
        pend.push(h);
        i = h.end;
        continue;
      }
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return { inner: src.slice(from, i), next: i + 1 };
    }
    i++;
  }
  return { inner: src.slice(from), next: n };
}

/**
 * Quebra um comando em comandos simples. Separadores: ; | & && || quebra de linha ( ). Aspas viram uma palavra só;
 * `$( )` e crases viram comandos extras (analisados à parte); heredocs e comentários são ignorados.
 * Barra invertida fora de aspas é literal (caminhos do Windows); `\"` e `\'` viram a aspa literal.
 */
export function parseShell(src: string, ps = false, depth = 0): RawCmd[] {
  const out: RawCmd[] = [];
  const n = src.length;
  let cmd = newCmd(false);
  let cur = "";
  let has = false;
  let quoted = false;
  let mode = 0; // 0 = argumento, 1 = alvo de saída, 2 = alvo de entrada
  let pending: Heredoc[] = [];
  const push = (): void => {
    if (!has) return;
    if (mode === 1) cmd.out.push(cur);
    else if (mode === 2) cmd.inp.push(cur);
    else cmd.words.push(cur);
    mode = 0;
    cur = "";
    has = false;
    quoted = false;
  };
  const endCmd = (pipe = false): void => {
    push();
    if (cmd.words.length > 0 || cmd.out.length > 0 || cmd.inp.length > 0 || cmd.here.length > 0) out.push(cmd);
    cmd = newCmd(pipe);
    mode = 0;
  };
  const sub = (inner: string): void => {
    if (depth < MAX_DEPTH) out.push(...parseShell(inner, ps, depth + 1));
  };

  let i = 0;
  while (i < n) {
    const c = src.charAt(i);
    if (c === " " || c === "\t") {
      if (has && !quoted && (cur === "{" || cur === "}")) {
        cur = "";
        has = false;
        endCmd();
      } else push();
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      endCmd();
      i++;
      if (c === "\n" && pending.length > 0) {
        for (const h of pending) {
          const r = skipBody(src, i, h);
          h.owner?.here.push(r.body);
          i = r.next;
        }
        pending = [];
      }
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      let s = "";
      for (;;) {
        const k = src.indexOf("'", j);
        if (k < 0) {
          s += src.slice(j);
          j = n;
          break;
        }
        s += src.slice(j, k);
        j = k + 1;
        if (ps && src.charAt(j) === "'") {
          s += "'";
          j++;
          continue;
        }
        break;
      }
      cur += s;
      has = true;
      quoted = true;
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < n) {
        const d = src.charAt(j);
        if (d === '"') {
          if (ps && src.charAt(j + 1) === '"') {
            s += '"';
            j += 2;
            continue;
          }
          j++;
          break;
        }
        if (!ps && d === "\\") {
          const e = src.charAt(j + 1);
          if (e === '"' || e === "\\" || e === "$" || e === "`") {
            s += e;
            j += 2;
            continue;
          }
          if (e === "\n") {
            j += 2;
            continue;
          }
          s += d;
          j++;
          continue;
        }
        if (ps && d === "`") {
          s += src.charAt(j + 1);
          j += 2;
          continue;
        }
        if (d === "$" && src.charAt(j + 1) === "(") {
          const m = matchParen(src, j + 2, ps);
          sub(m.inner);
          s += "$()";
          j = m.next;
          continue;
        }
        s += d;
        j++;
      }
      cur += s;
      has = true;
      quoted = true;
      i = j;
      continue;
    }
    if (c === "$" && src.charAt(i + 1) === "(") {
      const m = matchParen(src, i + 2, ps);
      sub(m.inner);
      cur += "$()";
      has = true;
      i = m.next;
      continue;
    }
    if (c === "`") {
      if (ps) {
        // escape do PowerShell: o próximo caractere é literal (crase + quebra = continuação)
        const e = src.charAt(i + 1);
        if (e !== "\n" && e !== "\r") {
          cur += e;
          has = true;
        }
        i += 2;
        continue;
      }
      const k = src.indexOf("`", i + 1);
      if (k > 0) {
        sub(src.slice(i + 1, k));
        cur += "``";
        has = true;
        i = k + 1;
        continue;
      }
    }
    if (c === "\\" && !ps) {
      const d = src.charAt(i + 1);
      if (d === "\n") {
        i += 2;
        continue;
      }
      if (d === "\r" && src.charAt(i + 2) === "\n") {
        i += 3;
        continue;
      }
      if (d === '"' || d === "'") {
        cur += d;
        has = true;
        i += 2;
        continue;
      }
      cur += c;
      has = true;
      i++;
      continue;
    }
    if (c === ";") {
      endCmd();
      i++;
      continue;
    }
    if (c === "|") {
      if (src.charAt(i + 1) === "|") {
        endCmd();
        i += 2;
        continue;
      }
      endCmd(true);
      i++;
      if (src.charAt(i) === "&") i++;
      continue;
    }
    if (c === "&") {
      if (src.charAt(i + 1) === ">") {
        push();
        i += 2;
        if (src.charAt(i) === ">") i++;
        mode = 1;
        continue;
      }
      endCmd();
      i++;
      continue;
    }
    if (c === ">") {
      if (has && !quoted && /^[0-9]$/.test(cur)) {
        cur = "";
        has = false;
      } else push();
      i++;
      if (src.charAt(i) === ">") i++;
      if (src.charAt(i) === "|") i++;
      if (src.charAt(i) === "&") {
        // >&2, >&1, >&-: duplica descritor, sem arquivo de destino
        i++;
        while (i < n && /[0-9-]/.test(src.charAt(i))) i++;
        continue;
      }
      mode = 1;
      continue;
    }
    if (c === "<") {
      if (!ps && src.charAt(i + 1) === "<") {
        if (src.charAt(i + 2) === "<") {
          push();
          i += 3;
          continue;
        }
        const h = readHeredoc(src, i);
        if (h !== null) {
          push();
          h.owner = cmd;
          pending.push(h);
          i = h.end;
          continue;
        }
      }
      if (ps && src.charAt(i + 1) === "#") {
        const k = src.indexOf("#>", i + 2);
        i = k < 0 ? n : k + 2;
        continue;
      }
      push();
      mode = 2;
      i++;
      continue;
    }
    if (c === "(" || c === ")") {
      endCmd();
      i++;
      continue;
    }
    if (c === "#" && !has) {
      const k = src.indexOf("\n", i);
      i = k < 0 ? n : k;
      continue;
    }
    if (ps && c === "@" && (src.charAt(i + 1) === "'" || src.charAt(i + 1) === '"')) {
      const q = src.charAt(i + 1);
      const m = /^[ \t]*\r?\n/.exec(src.slice(i + 2, i + 2 + 256));
      if (m !== null) {
        const k = src.indexOf(`\n${q}@`, i + 2);
        cur += k < 0 ? src.slice(i + 2 + m[0].length) : src.slice(i + 2 + m[0].length, k);
        has = true;
        quoted = true;
        i = k < 0 ? n : k + 3;
        continue;
      }
    }
    cur += c;
    has = true;
    i++;
  }
  endCmd();
  return out;
}

// ---------- desembrulho de invólucros ----------

const KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "{", "}", "time", "coproc", "function"]);
const SH_SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish", "ash"]);
const PS_SHELLS = new Set(["pwsh", "powershell"]);

/** Nome base do executável: sem diretório, em minúsculas, sem .exe/.cmd/.bat/.com/.ps1. */
export function baseName(word: string): string {
  const t = word.replace(/\\/g, "/");
  const k = t.lastIndexOf("/");
  return (k < 0 ? t : t.slice(k + 1)).toLowerCase().replace(/\.(exe|cmd|bat|com|ps1)$/, "");
}

/** Descarta as flags iniciais; `valueFlags` consomem o argumento seguinte. */
function dropFlags(rest: string[], valueFlags: readonly string[] = []): string[] {
  let i = 0;
  while (i < rest.length) {
    const t = rest[i] ?? "";
    if (t === "--") {
      i++;
      break;
    }
    if (!t.startsWith("-")) break;
    i += valueFlags.includes(t) ? 2 : 1;
  }
  return rest.slice(i);
}

function payloadCmds(payload: string, ps: boolean, depth: number): Cmd[] {
  return depth >= MAX_DEPTH ? [] : resolveCmds(parseShell(payload, ps, depth + 1), ps, depth + 1);
}

/**
 * Se `w[0]` é um invólucro, devolve o que ele executa (e acrescenta em `res` os comandos de cargas embutidas
 * como `bash -c "..."`). Devolve null quando `w[0]` não é invólucro (ou é `env` sem comando: despejo do ambiente).
 */
function unwrap(b: string, w: string[], ps: boolean, depth: number, res: Cmd[]): string[] | null {
  const rest = w.slice(1);
  switch (b) {
    case "command":
    case "builtin":
    case "exec":
    case "nohup":
    case "setsid":
    case "call":
    case "stdbuf":
    case "ionice":
      return dropFlags(rest);
    case "nice":
      return dropFlags(rest, ["-n", "--adjustment"]);
    case "sudo":
    case "doas":
      return dropFlags(rest, ["-u", "-g", "-h", "-p", "-C", "-r", "-t", "-U"]);
    case "timeout":
      return dropFlags(rest, ["-s", "-k", "--signal", "--kill-after"]).slice(1);
    case "xargs":
      return dropFlags(rest, ["-n", "-I", "-P", "-d", "-L", "-E", "-s", "-a", "-J"]);
    case "wsl":
      return dropFlags(rest, ["-d", "--distribution", "-u", "--user", "--cd"]);
    case "env": {
      let i = 0;
      while (i < rest.length) {
        const t = rest[i] ?? "";
        if (t === "-u" || t === "-C" || t === "-S") {
          i += 2;
          continue;
        }
        if (t.startsWith("-") || /^[A-Za-z_]\w*=/.test(t)) {
          i++;
          continue;
        }
        break;
      }
      const r = rest.slice(i);
      return r.length > 0 ? r : null;
    }
    case "eval":
      res.push(...payloadCmds(rest.join(" "), false, depth));
      return [];
    case "invoke-expression":
    case "iex":
      res.push(...payloadCmds(rest.join(" "), true, depth));
      return [];
    case "start-process":
    case "saps":
    case "start": {
      if (b === "start" && !ps) return null;
      let file = "";
      let argList = "";
      const pos: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        const t = rest[i] ?? "";
        const l = t.toLowerCase();
        if (l === "-filepath") file = rest[++i] ?? "";
        else if (l === "-argumentlist") argList = rest[++i] ?? "";
        else if (["-workingdirectory", "-verb", "-windowstyle", "-redirectstandardoutput", "-redirectstandarderror", "-redirectstandardinput", "-credential"].includes(l)) i++;
        else if (!t.startsWith("-")) pos.push(t);
      }
      if (file === "") file = pos.shift() ?? "";
      if (argList === "") argList = pos.shift() ?? "";
      if (file === "") return [];
      const extra = argList === "" ? [] : (parseShell(argList.replace(/,/g, " "), ps, depth + 1)[0]?.words ?? []);
      return [file, ...extra];
    }
    default:
      break;
  }
  if (SH_SHELLS.has(b)) {
    for (let i = 0; i < rest.length; i++) {
      if (/^-[a-z]*c[a-z]*$/i.test(rest[i] ?? "") && i + 1 < rest.length) {
        res.push(...payloadCmds(rest[i + 1] ?? "", false, depth));
        return [];
      }
    }
    return null;
  }
  if (PS_SHELLS.has(b)) {
    for (let i = 0; i < rest.length; i++) {
      const l = (rest[i] ?? "").toLowerCase();
      if (l === "-c" || l === "-command" || l === "-commandwithargs") {
        res.push(...payloadCmds(rest.slice(i + 1).join(" "), true, depth));
        return [];
      }
      if ((l === "-e" || l === "-enc" || l === "-ec" || l === "-encodedcommand") && i + 1 < rest.length) {
        try {
          res.push(...payloadCmds(Buffer.from(rest[i + 1] ?? "", "base64").toString("utf16le"), true, depth));
        } catch {
          // base64 inválido: sem carga para analisar
        }
        return [];
      }
    }
    return null;
  }
  if (b === "cmd") {
    for (let i = 0; i < rest.length; i++) {
      if (/^\/[ckr]$/i.test(rest[i] ?? "")) {
        res.push(...payloadCmds(rest.slice(i + 1).join(" "), false, depth));
        return [];
      }
    }
    return null;
  }
  return null;
}

const INTERPRETERS = new Set(["python", "python3", "py", "node", "bun", "deno", "perl", "ruby", "php", "lua", "tsx"]);
const ECHO_LIKE = new Set(["echo", "printf", "write-output", "write-host", "cat", "type"]);

/** Interpretador rodando código embutido (-e, -c, -p) ou lendo o programa da entrada padrão. */
export function isInlineInterpreter(c: { name: string; args: readonly string[] }): boolean {
  return INTERPRETERS.has(c.name) && (c.args.length === 0 || c.args.some((a) => /^(?:-e|-p|-c|-pe|-ne|-|--eval|--print)$/.test(a)));
}

/**
 * Comandos de shell escondidos em código de interpretador: cada texto entre aspas (`execSync('git push -f')`,
 * `os.system("cat .env")`) e cada lista de textos (`['git','push','-f']`) é analisado como se fosse um comando.
 */
function embeddedCmds(code: string, depth: number): Cmd[] {
  if (depth >= MAX_DEPTH) return [];
  const out: Cmd[] = [];
  for (const m of code.matchAll(/'((?:[^'\\\n]|\\.){3,300})'|"((?:[^"\\\n]|\\.){3,300})"|`([^`\n]{3,300})`/g)) {
    out.push(...payloadCmds(m[1] ?? m[2] ?? m[3] ?? "", false, depth));
  }
  for (const m of code.matchAll(/\[\s*(?:'[^'\n]*'|"[^"\n]*")(?:\s*,\s*(?:'[^'\n]*'|"[^"\n]*"))+\s*\]/g)) {
    const items = [...m[0].matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map((x) => x[1] ?? x[2] ?? "");
    out.push(...resolveCmds([{ ...newCmd(false), words: items }], false, depth + 1));
  }
  return out;
}

/** Resolve comandos crus em comandos com nome base e argumentos, desembrulhando invólucros e cargas de script. */
export function resolveCmds(raws: RawCmd[], ps: boolean, depth = 0): Cmd[] {
  const res: Cmd[] = [];
  raws.forEach((raw, idx) => {
    let w = raw.words.slice();
    for (let guard = 0; guard < 8 && w.length > 0; guard++) {
      const first = w[0] ?? "";
      if (KEYWORDS.has(first) || /^[A-Za-z_]\w*=/.test(first)) {
        w = w.slice(1);
        continue;
      }
      const next = unwrap(baseName(first), w, ps, depth, res);
      if (next === null) break;
      w = next;
    }
    const head = baseName(raw.words[0] ?? "");
    const name = baseName(w[0] ?? "");
    const cmd: Cmd = { name, args: w.slice(1), out: raw.out, inp: raw.inp };
    if (w.length > 0 || raw.out.length > 0 || raw.inp.length > 0) res.push(cmd);
    // shell que lê o script da entrada padrão: `bash <<EOF ... EOF`, `echo "..." | bash`, `... | iex`
    const iexBare = w.length === 0 && (head === "iex" || head === "invoke-expression") && raw.words.length === 1;
    const shellStdin = w.length > 0 && (SH_SHELLS.has(name) || PS_SHELLS.has(name)) && w.slice(1).every((a) => a.startsWith("-"));
    if (shellStdin || iexBare) {
      const scripts = [...raw.here];
      const prev = idx > 0 ? raws[idx - 1] : undefined;
      if (raw.piped && prev !== undefined) {
        const prevHead = prev.words[0] ?? "";
        if (ECHO_LIKE.has(baseName(prevHead))) scripts.push(...prev.here, prev.words.slice(1).filter((a) => !a.startsWith("-")).join(" "));
        else if (prev.words.length === 1 && /\s/.test(prevHead)) scripts.push(prevHead); // 'git push -f' | iex
      }
      for (const s of scripts) if (s.trim() !== "") res.push(...payloadCmds(s, PS_SHELLS.has(name) || iexBare, depth));
    }
    // código de interpretador (-e, -c ou heredoc): textos entre aspas viram comandos
    if (w.length > 0 && INTERPRETERS.has(name) && (isInlineInterpreter(cmd) || raw.here.length > 0)) {
      res.push(...embeddedCmds([w.slice(1).join(" "), ...raw.here].join("\n"), depth));
    }
  });
  return res;
}

/** Atalho: texto do comando -> comandos resolvidos. */
export function analyze(command: string, ps: boolean): Cmd[] {
  return resolveCmds(parseShell(command, ps), ps, 0);
}

// ---------- caminhos e glob ----------

/**
 * Normaliza um caminho para comparação: `~` e $HOME/$env:USERPROFILE/%USERPROFILE% viram a home, `\` vira `/`,
 * `/c/Users` vira `c:/users`, minúsculas, sem `.`, `..` nem barra final. Relativo + `cwd` = juntado ao cwd.
 */
export function normPath(p: string, home: string, cwd = ""): string {
  let s = p.trim();
  s = s.replace(/^(?:\$\{?env:(?:userprofile|home)\}?|\$\{?(?:home|userprofile)\}?|%(?:userprofile|home)%)(?=[\\/]|$)/i, "~");
  if (s === "~" || s.startsWith("~/") || s.startsWith("~\\")) s = home + s.slice(1);
  s = s.replace(/\\/g, "/").replace(/^\/\/\?\//, "");
  s = s.replace(/^\/([a-zA-Z])(?=\/|$)/, "$1:").toLowerCase();
  const abs = /^[a-z]:(\/|$)/.test(s) || s.startsWith("/");
  if (!abs && cwd !== "" && !/^[$%]/.test(s)) s = `${normPath(cwd, home)}/${s}`;
  const stack: string[] = [];
  for (const seg of s.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      const top = stack[stack.length - 1];
      if (top !== undefined && top !== ".." && !/^[a-z]:$/.test(top)) stack.pop();
      else if (!abs) stack.push("..");
      continue;
    }
    stack.push(seg);
  }
  return (s.startsWith("/") ? "/" : "") + stack.join("/");
}

/**
 * Compila um glob para RegExp ancorada. `**` casa qualquer coisa (inclusive `/`); `**` + `/` casa zero ou mais
 * diretórios; `/**` no fim casa o diretório e tudo abaixo; `*` casa tudo menos `/`; `?` casa um caractere menos `/`.
 * O glob é normalizado como o caminho (barras `/`, minúsculas).
 */
export function globToRegExp(glob: string): RegExp {
  let g = glob.replace(/\\/g, "/").toLowerCase();
  let tail = "";
  if (g.endsWith("/**")) {
    g = g.slice(0, -3);
    tail = "(?:/.*)?";
  }
  let re = "";
  let i = 0;
  while (i < g.length) {
    const c = g.charAt(i);
    if (c === "*") {
      if (g.charAt(i + 1) === "*") {
        if (g.charAt(i + 2) === "/") {
          re += "(?:.*/)?";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i++;
      }
      continue;
    }
    if (c === "?") {
      re += "[^/]";
      i++;
      continue;
    }
    re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    i++;
  }
  return new RegExp(`^${re}${tail}$`);
}

// ---------- alvos de escrita ----------

const WRITE_ALL = new Set([
  "rm", "del", "erase", "rd", "rmdir", "ri", "remove-item", "unlink", "shred",
  "mv", "move", "move-item", "mi", "ren", "rename", "rename-item", "rni",
  "tee", "set-content", "sc", "add-content", "ac", "out-file", "new-item", "ni", "clear-content", "clc",
  "touch", "truncate", "ln", "mklink",
]);
const COPY_VERBS = new Set(["cp", "copy", "copy-item", "cpi", "xcopy", "robocopy", "install"]);

/** Alvo de um argumento: tira o prefixo de parâmetro (`-Path:x`, `--out=x`) e devolve o valor. */
function argValue(t: string): string | null {
  if (!t.startsWith("-")) return t;
  const m = /^-{1,2}[A-Za-z][\w-]*[:=](.+)$/.exec(t);
  return m === null ? null : (m[1] ?? null);
}

/** Argumentos que um comando de cópia lê (origens) e escreve (destinos). */
export function copyParts(args: string[]): { sources: string[]; dests: string[] } {
  const dests: string[] = [];
  const pos: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const t = args[i] ?? "";
    const l = t.toLowerCase();
    if (l === "-destination" || l === "-dest" || l === "-t" || l === "--target-directory") {
      const v = args[++i];
      if (v !== undefined) dests.push(v);
      continue;
    }
    const m = /^-(?:destination|dest):(.+)$/i.exec(t) ?? /^--target-directory=(.+)$/.exec(t);
    if (m !== null) {
      dests.push(m[1] ?? "");
      continue;
    }
    const v = argValue(t);
    if (v !== null) pos.push(v);
  }
  if (dests.length === 0) {
    const last = pos.pop();
    if (last !== undefined) dests.push(last);
  }
  return { sources: pos, dests };
}

/** Caminhos que o comando escreve, move ou apaga (inclui redirecionamentos). Cópia: só o destino. */
export function writeTargets(c: Cmd): string[] {
  const t: string[] = [...c.out];
  const a = c.args;
  const values = (): string[] => a.map(argValue).filter((x): x is string => x !== null);
  if (WRITE_ALL.has(c.name)) t.push(...values());
  else if (COPY_VERBS.has(c.name)) t.push(...copyParts(a).dests);
  else if (c.name === "sed" || c.name === "perl") {
    const inplace = a.some((x) => (c.name === "sed" ? /^-[A-Za-z]*i/.test(x) || x.startsWith("--in-place") : /^-[A-Za-z]*i/.test(x)));
    if (inplace) t.push(...values());
  } else if (c.name === "curl" || c.name === "wget" || c.name === "iwr" || c.name === "irm" || c.name === "invoke-webrequest" || c.name === "invoke-restmethod") {
    for (let i = 0; i < a.length; i++) {
      const l = (a[i] ?? "").toLowerCase();
      if (l === "-o" || l === "--output" || l === "-outfile" || l === "--output-document") {
        const v = a[i + 1];
        if (v !== undefined) t.push(v);
      } else {
        const m = /^(?:-outfile:|--output=|--output-document=)(.+)$/i.exec(a[i] ?? "");
        if (m !== null) t.push(m[1] ?? "");
      }
    }
  } else if (c.name === "dd") {
    for (const x of a) if (x.startsWith("of=")) t.push(x.slice(3));
  }
  return t;
}
