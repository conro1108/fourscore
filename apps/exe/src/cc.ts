/**
 * CC — the machine's own C compiler, pure logic, no DOM. The law ("don't draw
 * the OS — run it") holds here the same way it holds in vm.ts: CC does not
 * pretend to compile, it parses a small C and emits real assembly text that
 * assemble() turns into real machine words. The player can TYPE the output.
 *
 * The dialect (documented for the player in c.txt on the disk — the seed in
 * copy.ts and this file must agree, and cc.test.ts compiles the shipped .c
 * seed to hold them together):
 *
 *   Types      int and char are both one 16-bit word; pointers and arrays
 *              are word addresses. void is a courtesy. struct names a
 *              layout: every field is one word (a struct-typed field must
 *              be a pointer), x.f and p->f are the same arithmetic, and
 *              sizeof(struct S) counts fields. Define a struct before it
 *              is used; a struct value is its address, the way an array is.
 *   Functions  arguments and locals, recursion works. main() is the program.
 *   Statements if/else, while, do/while, for, break, continue, return,
 *              asm("...") passes a line straight to the assembler.
 *   Operators  the usual ones, with C precedence: assignment (and op=),
 *              ?:, || && | ^ &, comparisons, shifts, arithmetic, !, ~,
 *              unary -, * and & on pointers, ++ and --, [] and calls.
 *   Builtins   putc(c) putn(n) puts(s) getc() key() rand() — the hardware
 *              ports, wearing C. getc waits; key does not. The screen ports
 *              wear C too: vpos(p) aims the cursor (cell 0..959 on 40x24),
 *              vput(c) prints there and moves on, vsync() rests until the
 *              display's next frame. malloc(n) hands out n words from a
 *              heap that starts where the program ends; the words arrive
 *              zeroed and are never reused — free() is accepted and does
 *              nothing.
 *   Data       int a[4] = {1, 2, 3}; fills in order and pads with zeros;
 *              int a[] = {...} counts for you. Constants only, but local
 *              and global alike.
 *   #define    NAME value, one token, numbers only.
 *
 * How it lands on the processor: R0 is the accumulator, R1 the second
 * operand, R6 an address in hand. The hardware stack (CALL/RET/PUSH/POP)
 * carries return addresses and expression temporaries; it cannot be
 * addressed, so arguments and locals live on a second stack the compiler
 * runs itself — R7 points at it (starting at 0x0E00, growing down) and R5
 * frames it. Comparisons are signed by the 0x8000-bias trick; DIV and MOD
 * are unsigned hardware, so signed division is a small runtime routine
 * emitted only when a program divides.
 */

export interface CcError {
  line: number;
  msg: string;
}

export type CcResult = { ok: true; asm: string } | { ok: false; errors: CcError[] };

/** Data stack top. The hardware stack (0x0F00 down) gets the page above it. */
const DATA_STACK_TOP = 0x0e00;

/* ---- tokens ---- */

type TokKind = "num" | "str" | "id" | "punct" | "eof";
interface Tok {
  kind: TokKind;
  text: string;
  value: number; // num: the value; str: index into strings table
  line: number;
}

const PUNCTS = [
  "<<=", ">>=",
  "==", "!=", "<=", ">=", "&&", "||", "++", "--", "->",
  "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>",
  "+", "-", "*", "/", "%", "&", "|", "^", "~", "!", "<", ">", "=",
  "(", ")", "[", "]", "{", "}", ",", ";", "?", ":", ".",
];

const KEYWORDS = new Set([
  "int", "char", "void", "struct", "sizeof", "if", "else", "while", "do", "for",
  "return", "break", "continue", "asm",
]);

/** The hardware, wearing C. A program may not redefine these. malloc and
    free live here too: the heap is the machine's, not the program's. */
const BUILTINS = new Set([
  "putc", "putn", "puts", "getc", "key", "rand", "vpos", "vput", "vsync", "malloc", "free",
]);

class Stop {
  constructor(readonly error: CcError) {}
}

function escChar(c: string, line: number): number {
  if (c === "n") return 10;
  if (c === "t") return 9;
  if (c === "0") return 0;
  if (c === "\\") return 92;
  if (c === "'") return 39;
  if (c === '"') return 34;
  throw new Stop({ line, msg: `Unknown escape: \\${c}` });
}

function lex(src: string, defines: Map<string, number>): { toks: Tok[]; strings: string[] } {
  const toks: Tok[] = [];
  const strings: string[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;

  while (i < n) {
    const c = src[i]!;
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      if (i >= n) throw new Stop({ line, msg: "A comment opened and never closed" });
      i += 2;
      continue;
    }
    if (c === "#") {
      // #define NAME value — the whole preprocessor, honestly sized
      const eol = src.indexOf("\n", i);
      const text = (eol === -1 ? src.slice(i) : src.slice(i, eol)).trim();
      const m = /^#\s*define\s+([A-Za-z_]\w*)\s+(\S+)\s*$/.exec(text);
      if (!m) throw new Stop({ line, msg: "Only #define NAME value is understood" });
      const v = parseCNum(m[2]!, line);
      if (v === null) throw new Stop({ line, msg: `#define needs a number: ${m[2]}` });
      defines.set(m[1]!, v);
      i = eol === -1 ? n : eol;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /\w/.test(src[j]!)) j++;
      const word = src.slice(i, j);
      const def = defines.get(word);
      if (def !== undefined && !KEYWORDS.has(word)) {
        toks.push({ kind: "num", text: word, value: def, line });
      } else {
        toks.push({ kind: "id", text: word, value: 0, line });
      }
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9a-fA-FxX]/.test(src[j]!)) j++;
      const v = parseCNum(src.slice(i, j), line);
      if (v === null) throw new Stop({ line, msg: `Not a number: ${src.slice(i, j)}` });
      toks.push({ kind: "num", text: src.slice(i, j), value: v, line });
      i = j;
      continue;
    }
    if (c === "'") {
      let v: number;
      if (src[i + 1] === "\\") {
        v = escChar(src[i + 2] ?? "", line);
        i += 3;
      } else {
        if (i + 1 >= n || src[i + 1] === "\n")
          throw new Stop({ line, msg: "A character opened and never closed" });
        v = src.charCodeAt(i + 1);
        i += 2;
      }
      if (src[i] !== "'") throw new Stop({ line, msg: "A character wants one character" });
      i++;
      toks.push({ kind: "num", text: "'", value: v, line });
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let out = "";
      while (j < n && src[j] !== '"') {
        if (src[j] === "\n") throw new Stop({ line, msg: "A string opened and never closed" });
        if (src[j] === "\\") {
          out += String.fromCharCode(escChar(src[j + 1] ?? "", line));
          j += 2;
        } else {
          out += src[j];
          j++;
        }
      }
      if (j >= n) throw new Stop({ line, msg: "A string opened and never closed" });
      toks.push({ kind: "str", text: out, value: strings.length, line });
      strings.push(out);
      i = j + 1;
      continue;
    }
    const p = PUNCTS.find((p) => src.startsWith(p, i));
    if (p) {
      toks.push({ kind: "punct", text: p, value: 0, line });
      i += p.length;
      continue;
    }
    throw new Stop({ line, msg: `The compiler does not recognise: ${c}` });
  }
  toks.push({ kind: "eof", text: "", value: 0, line });
  return { toks, strings };
}

function parseCNum(tok: string, line: number): number | null {
  if (!/^-?(0[xX][0-9a-fA-F]+|\d+)$/.test(tok)) return null;
  const v = Number(tok);
  if (!Number.isSafeInteger(v) || v < -0x8000 || v > 0xffff)
    throw new Stop({ line, msg: `A word holds -32768..65535: ${tok}` });
  return v & 0xffff;
}

/* ---- the tree ---- */

type Expr =
  | { kind: "num"; value: number; line: number }
  | { kind: "str"; index: number; line: number }
  | { kind: "id"; name: string; line: number }
  | { kind: "un"; op: string; e: Expr; line: number }
  | { kind: "bin"; op: string; l: Expr; r: Expr; line: number }
  | { kind: "assign"; op: string; lv: Expr; e: Expr; line: number }
  | { kind: "cond"; c: Expr; t: Expr; f: Expr; line: number }
  | { kind: "incdec"; op: "++" | "--"; pre: boolean; lv: Expr; line: number }
  | { kind: "index"; base: Expr; idx: Expr; line: number }
  | { kind: "field"; base: Expr; name: string; line: number }
  | { kind: "call"; name: string; args: Expr[]; line: number };

/** One declared name. `words` is its whole footprint (array size, struct
    field count, or 1); `s` is its struct type, pointer or value alike —
    both evaluate to an address of an S, so one tag serves. */
interface DeclName {
  name: string;
  size: number | null; // null: scalar; number: array of that many words
  words: number;
  s: string | null;
  /** A struct held by value — the name is its address, the way an array is. */
  val: boolean;
  init: Expr | null;
  list: number[] | null;
  line: number;
}

type Stmt =
  | { kind: "expr"; e: Expr; line: number }
  | { kind: "decl"; names: DeclName[]; line: number }
  | { kind: "if"; c: Expr; t: Stmt; f: Stmt | null; line: number }
  | { kind: "while"; c: Expr; body: Stmt; line: number }
  | { kind: "do"; c: Expr; body: Stmt; line: number }
  | { kind: "for"; init: Expr | null; c: Expr | null; step: Expr | null; body: Stmt; line: number }
  | { kind: "return"; e: Expr | null; line: number }
  | { kind: "break"; line: number }
  | { kind: "continue"; line: number }
  | { kind: "block"; body: Stmt[]; line: number }
  | { kind: "asm"; text: string; line: number }
  | { kind: "empty"; line: number };

interface FnDecl {
  name: string;
  params: { name: string; s: string | null }[];
  /** Struct type of the return value, when the function returns one. */
  retS: string | null;
  body: Stmt[];
  line: number;
}
interface GlobalDecl {
  name: string;
  size: number | null; // null: scalar; number: array of that many words
  words: number;
  s: string | null;
  val: boolean;
  init: number | { str: number } | null;
  list: number[] | null;
  line: number;
}
/** A struct layout: field order is field offset; `s` is the struct a
    pointer field points at, for the chains (p->next->val). */
interface StructDecl {
  fields: { name: string; s: string | null }[];
  line: number;
}

/* ---- parser ---- */

const BIN_LEVELS: string[][] = [
  ["||"],
  ["&&"],
  ["|"],
  ["^"],
  ["&"],
  ["==", "!="],
  ["<", ">", "<=", ">="],
  ["<<", ">>"],
  ["+", "-"],
  ["*", "/", "%"],
];

const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="]);

function parse(toks: Tok[]): { fns: FnDecl[]; globals: GlobalDecl[]; structs: Map<string, StructDecl> } {
  let p = 0;
  const peek = (): Tok => toks[p]!;
  const next = (): Tok => toks[p++]!;
  const at = (text: string): boolean => peek().kind !== "eof" && peek().text === text && peek().kind !== "str";
  const eat = (text: string): boolean => (at(text) ? (p++, true) : false);
  const expect = (text: string): Tok => {
    if (!at(text)) throw new Stop({ line: peek().line, msg: `Expected ${text}, got ${describe(peek())}` });
    return next();
  };
  const describe = (t: Tok): string =>
    t.kind === "eof" ? "the end of the file" : t.kind === "str" ? "a string" : `'${t.text}'`;
  const isType = (t: Tok): boolean =>
    t.kind === "id" && (t.text === "int" || t.text === "char" || t.text === "void" || t.text === "struct");

  const expectName = (): Tok => {
    const t = next();
    if (t.kind !== "id" || KEYWORDS.has(t.text))
      throw new Stop({ line: t.line, msg: `Expected a name, got ${describe(t)}` });
    return t;
  };

  const structs = new Map<string, StructDecl>();
  const structSize = (name: string, line: number): number => {
    const s = structs.get(name);
    if (!s) throw new Stop({ line, msg: `Unknown struct: ${name} (define it before it is used)` });
    return s.fields.length;
  };

  /** Consume int/char/void or struct Name; the stars come per declared name. */
  const typeSpec = (): { s: string | null } => {
    const t = next();
    if (t.text !== "struct") return { s: null };
    const nameTok = expectName();
    structSize(nameTok.text, nameTok.line); // it must exist
    return { s: nameTok.text };
  };

  function primary(): Expr {
    const t = next();
    if (t.kind === "num") return { kind: "num", value: t.value, line: t.line };
    if (t.kind === "str") return { kind: "str", index: t.value, line: t.line };
    if (t.kind === "id" && !KEYWORDS.has(t.text)) return { kind: "id", name: t.text, line: t.line };
    if (t.kind === "punct" && t.text === "(") {
      const e = expr();
      expect(")");
      return e;
    }
    throw new Stop({ line: t.line, msg: `Expected an expression, got ${describe(t)}` });
  }

  function postfix(): Expr {
    let e = primary();
    for (;;) {
      const line = peek().line;
      if (eat("(")) {
        if (e.kind !== "id")
          throw new Stop({ line, msg: "Only a named function can be called" });
        const args: Expr[] = [];
        if (!at(")")) {
          do args.push(assignExpr());
          while (eat(","));
        }
        expect(")");
        e = { kind: "call", name: e.name, args, line };
      } else if (eat("[")) {
        const idx = expr();
        expect("]");
        e = { kind: "index", base: e, idx, line };
      } else if (at(".") || at("->")) {
        // one word per field, so . and -> are the same arithmetic; the
        // compiler accepts either and does not tell on you
        next();
        e = { kind: "field", base: e, name: expectName().text, line };
      } else if (at("++") || at("--")) {
        const op = next().text as "++" | "--";
        e = { kind: "incdec", op, pre: false, lv: e, line };
      } else break;
    }
    return e;
  }

  function unary(): Expr {
    const t = peek();
    if (t.kind === "id" && t.text === "sizeof") {
      // sizeof takes a type and answers in words, which is what a word
      // machine means by size. sizeof(struct S) counts fields.
      next();
      expect("(");
      let words = 1;
      if (at("struct")) {
        next();
        const n = expectName();
        words = structSize(n.text, n.line);
        if (eat("*")) words = 1;
        while (eat("*")) {
          /* a pointer is a word */
        }
      } else if (isType(peek())) {
        next();
        while (eat("*")) {
          /* a pointer is a word */
        }
      } else throw new Stop({ line: t.line, msg: "sizeof wants a type" });
      expect(")");
      return { kind: "num", value: words, line: t.line };
    }
    if (t.kind === "punct") {
      if (t.text === "++" || t.text === "--") {
        next();
        return { kind: "incdec", op: t.text as "++" | "--", pre: true, lv: unary(), line: t.line };
      }
      if (["-", "!", "~", "*", "&"].includes(t.text)) {
        next();
        const e = unary();
        if (t.text === "-" && e.kind === "num")
          return { kind: "num", value: (0x10000 - e.value) & 0xffff, line: t.line };
        return { kind: "un", op: t.text, e, line: t.line };
      }
      if (t.text === "(") {
        // a cast is punctuation to this machine: (int), (char *),
        // (struct Node *) all vanish
        const save = p;
        next();
        if (isType(peek())) {
          if (next().text === "struct") expectName();
          while (eat("*")) {
            /* pointers are words too */
          }
          if (eat(")")) return unary();
        }
        p = save;
      }
    }
    return postfix();
  }

  function binLevel(level: number): Expr {
    if (level >= BIN_LEVELS.length) return unary();
    let e = binLevel(level + 1);
    for (;;) {
      const t = peek();
      if (t.kind === "punct" && BIN_LEVELS[level]!.includes(t.text)) {
        next();
        e = { kind: "bin", op: t.text, l: e, r: binLevel(level + 1), line: t.line };
      } else return e;
    }
  }

  function condExpr(): Expr {
    const c = binLevel(0);
    if (eat("?")) {
      const line = toks[p - 1]!.line;
      const t = assignExpr();
      expect(":");
      return { kind: "cond", c, t, f: assignExpr(), line };
    }
    return c;
  }

  function assignExpr(): Expr {
    const lv = condExpr();
    const t = peek();
    if (t.kind === "punct" && ASSIGN_OPS.has(t.text)) {
      next();
      return { kind: "assign", op: t.text, lv, e: assignExpr(), line: t.line };
    }
    return lv;
  }

  function expr(): Expr {
    return assignExpr();
  }

  /** [N], [] (the initialiser list counts for you), or nothing (null).
      -1 stands for "counted later". */
  function arraySuffix(): number | null {
    if (!eat("[")) return null;
    if (eat("]")) return -1;
    const sz = next();
    if (sz.kind !== "num" || sz.value === 0 || sz.value > 0x0e00)
      throw new Stop({ line: sz.line, msg: "An array wants a fixed size" });
    expect("]");
    return sz.value;
  }

  /** { 1, -2, 'a' } — constants only; the program hasn't started yet. */
  function initList(line: number): number[] {
    expect("{");
    const vals: number[] = [];
    do {
      if (at("}")) break; // a trailing comma is legal C and stays legal here
      const neg = eat("-");
      const t = next();
      if (t.kind !== "num")
        throw new Stop({ line: t.line, msg: "An initialiser list wants numbers" });
      vals.push(neg ? (0x10000 - t.value) & 0xffff : t.value);
    } while (eat(","));
    expect("}");
    if (!vals.length)
      throw new Stop({ line, msg: "An initialiser list wants at least one value" });
    return vals;
  }

  /** The declared-name suffix grammar locals and globals share: stars, the
      name, [N] or [] = {...} or = init. The caller supplies the base type. */
  function declName(s: string | null): Omit<DeclName, "init"> & { sawEq: boolean } {
    let stars = 0;
    while (eat("*")) stars++;
    const nameTok = expectName();
    const val = s !== null && stars === 0;
    let size = arraySuffix();
    let list: number[] | null = null;
    let sawEq = false;
    if (val && size !== null)
      throw new Stop({ line: nameTok.line, msg: "An array of structs wants pointers" });
    if (size !== null && at("=")) {
      next();
      list = initList(nameTok.line);
      if (size === -1) size = list.length;
      if (list.length > size)
        throw new Stop({ line: nameTok.line, msg: `${list.length} values into ${size} slots` });
    } else if (size === -1) {
      throw new Stop({ line: nameTok.line, msg: "[] wants an initialiser list to count" });
    } else if (size === null && eat("=")) {
      if (val) throw new Stop({ line: nameTok.line, msg: "A struct starts empty — fill its fields" });
      sawEq = true;
    }
    const words = size ?? (val ? structSize(s!, nameTok.line) : 1);
    return { name: nameTok.text, size, words, s, val, list, line: nameTok.line, sawEq };
  }

  function declStmt(line: number, s: string | null): Stmt {
    const names: DeclName[] = [];
    do {
      const d = declName(s);
      const init = d.sawEq ? assignExpr() : null;
      names.push({ ...d, init });
    } while (eat(","));
    expect(";");
    return { kind: "decl", names, line };
  }

  function stmt(): Stmt {
    const t = peek();
    const line = t.line;
    if (isType(t)) {
      return declStmt(line, typeSpec().s);
    }
    if (t.kind === "id" && KEYWORDS.has(t.text)) {
      if (eat("if")) {
        expect("(");
        const c = expr();
        expect(")");
        const then = stmt();
        const f = eat("else") ? stmt() : null;
        return { kind: "if", c, t: then, f, line };
      }
      if (eat("while")) {
        expect("(");
        const c = expr();
        expect(")");
        return { kind: "while", c, body: stmt(), line };
      }
      if (eat("do")) {
        const body = stmt();
        expect("while");
        expect("(");
        const c = expr();
        expect(")");
        expect(";");
        return { kind: "do", c, body, line };
      }
      if (eat("for")) {
        expect("(");
        const init = at(";") ? null : expr();
        expect(";");
        const c = at(";") ? null : expr();
        expect(";");
        const step = at(")") ? null : expr();
        expect(")");
        return { kind: "for", init, c, step, body: stmt(), line };
      }
      if (eat("return")) {
        const e = at(";") ? null : expr();
        expect(";");
        return { kind: "return", e, line };
      }
      if (eat("break")) {
        expect(";");
        return { kind: "break", line };
      }
      if (eat("continue")) {
        expect(";");
        return { kind: "continue", line };
      }
      if (eat("asm")) {
        expect("(");
        const s = next();
        if (s.kind !== "str") throw new Stop({ line: s.line, msg: 'asm wants a "quoted string"' });
        expect(")");
        expect(";");
        return { kind: "asm", text: s.text, line };
      }
      throw new Stop({ line, msg: `'${t.text}' cannot start a statement` });
    }
    if (eat("{")) {
      const body: Stmt[] = [];
      while (!eat("}")) {
        if (peek().kind === "eof") throw new Stop({ line, msg: "A { opened and never closed" });
        body.push(stmt());
      }
      return { kind: "block", body, line };
    }
    if (eat(";")) return { kind: "empty", line };
    const e = expr();
    expect(";");
    return { kind: "expr", e, line };
  }

  function constInit(line: number): number | { str: number } {
    // globals initialise to constants — the program hasn't started yet
    const neg = eat("-");
    const t = next();
    if (t.kind === "num") return neg ? (0x10000 - t.value) & 0xffff : t.value;
    if (t.kind === "str" && !neg) return { str: t.value };
    throw new Stop({ line, msg: "A global starts as a number or a string" });
  }

  /** struct Name { int val; struct Name *next; }; — a layout. A field is
      one word, so a struct-typed field must be a pointer, which is also
      what lets a list point at itself before its own } arrives. */
  function structDef(): void {
    next(); // struct
    const nameTok = expectName();
    if (structs.has(nameTok.text))
      throw new Stop({ line: nameTok.line, msg: `Defined twice: struct ${nameTok.text}` });
    expect("{");
    const fields: { name: string; s: string | null }[] = [];
    while (!eat("}")) {
      if (peek().kind === "eof")
        throw new Stop({ line: nameTok.line, msg: "A { opened and never closed" });
      const ft = peek();
      if (!isType(ft)) throw new Stop({ line: ft.line, msg: "A field starts with its type" });
      // fields skip typeSpec's exists-check so a struct can point at itself
      const fs = next().text === "struct" ? expectName().text : null;
      do {
        let stars = 0;
        while (eat("*")) stars++;
        const fname = expectName();
        if (fs !== null && stars === 0)
          throw new Stop({ line: fname.line, msg: "A struct field holds one word — use a pointer" });
        if (fields.some((f) => f.name === fname.text))
          throw new Stop({ line: fname.line, msg: `Defined twice: ${fname.text}` });
        fields.push({ name: fname.text, s: fs });
      } while (eat(","));
      expect(";");
    }
    expect(";");
    if (!fields.length)
      throw new Stop({ line: nameTok.line, msg: "A struct wants at least one field" });
    structs.set(nameTok.text, { fields, line: nameTok.line });
  }

  const fns: FnDecl[] = [];
  const globals: GlobalDecl[] = [];
  while (peek().kind !== "eof") {
    const t = peek();
    if (!isType(t))
      throw new Stop({ line: t.line, msg: `Expected int, char, void or struct, got ${describe(t)}` });
    if (t.text === "struct" && toks[p + 2]?.text === "{") {
      structDef();
      continue;
    }
    const spec = typeSpec();
    const save = p;
    while (eat("*")) {
      /* a pointer is a word */
    }
    const nameTok = expectName();
    if (at("(")) {
      next();
      const params: { name: string; s: string | null }[] = [];
      if (!at(")")) {
        if (at("void") && toks[p + 1]!.text === ")") next();
        else
          do {
            const pt = peek();
            if (!isType(pt)) throw new Stop({ line: pt.line, msg: "A parameter starts with its type" });
            const ps = typeSpec().s;
            while (eat("*")) {
              /* a pointer is a word */
            }
            params.push({ name: expectName().text, s: ps });
          } while (eat(","));
      }
      expect(")");
      expect("{");
      const body: Stmt[] = [];
      while (!eat("}")) {
        if (peek().kind === "eof")
          throw new Stop({ line: nameTok.line, msg: "A { opened and never closed" });
        body.push(stmt());
      }
      fns.push({ name: nameTok.text, params, retS: spec.s, body, line: nameTok.line });
    } else {
      // a global — possibly several on the line, same suffix grammar as a local
      p = save;
      do {
        const d = declName(spec.s);
        const init = d.sawEq ? constInit(d.line) : null;
        globals.push({ ...d, init });
      } while (eat(","));
      expect(";");
    }
  }
  // a field may name a struct defined later; by here, later has happened
  for (const [sname, sd] of structs)
    for (const f of sd.fields)
      if (f.s !== null && !structs.has(f.s))
        throw new Stop({ line: sd.line, msg: `Unknown struct: ${f.s} (a field of ${sname})` });
  return { fns, globals, structs };
}

/* ---- code generation ---- */

interface Local {
  slot: number; // frame slot index; scalar at fp-(1+slot), array base fp-(slot+size)
  size: number | null;
  /** Struct type, pointer and value alike — either way the id names an S. */
  s: string | null;
}

function countSlots(body: Stmt[]): number {
  let n = 0;
  const walk = (s: Stmt): void => {
    if (s.kind === "decl") for (const d of s.names) n += d.words;
    else if (s.kind === "block") s.body.forEach(walk);
    else if (s.kind === "if") {
      walk(s.t);
      if (s.f) walk(s.f);
    } else if (s.kind === "while" || s.kind === "do" || s.kind === "for") walk(s.body);
  };
  body.forEach(walk);
  return n;
}

export function compileC(src: string): CcResult {
  try {
    const defines = new Map<string, number>();
    const { toks, strings } = lex(src, defines);
    const { fns, globals, structs } = parse(toks);
    return emit(fns, globals, strings, structs);
  } catch (e) {
    if (e instanceof Stop) return { ok: false, errors: [e.error] };
    throw e;
  }
}

function emit(
  fns: FnDecl[],
  globals: GlobalDecl[],
  strings: string[],
  structs: Map<string, StructDecl>,
): CcResult {
  const errors: CcError[] = [];
  const out: string[] = [];
  const rt = new Set<string>();
  let labelSeq = 0;
  const label = (): string => `l${labelSeq++}`;
  /** A word as the assembler likes it: hex once the sign bit is riding. */
  const imm = (v: number): string => (v >= 0x8000 ? `0x${v.toString(16)}` : String(v));
  const ln = (s: string): void => {
    out.push(s.startsWith(";") || s.endsWith(":") ? s : `        ${s}`);
  };

  const fnByName = new Map<string, FnDecl>();
  for (const f of fns) {
    if (fnByName.has(f.name)) errors.push({ line: f.line, msg: `Defined twice: ${f.name}` });
    if (BUILTINS.has(f.name))
      errors.push({ line: f.line, msg: `That name belongs to the machine: ${f.name}` });
    fnByName.set(f.name, f);
  }
  const globalByName = new Map<string, GlobalDecl>();
  for (const g of globals) {
    if (globalByName.has(g.name) || fnByName.has(g.name))
      errors.push({ line: g.line, msg: `Defined twice: ${g.name}` });
    globalByName.set(g.name, g);
  }
  if (!fnByName.has("main")) errors.push({ line: 0, msg: "The program needs a main()" });

  /* ---- per-function state ---- */
  let scopes: Map<string, Local>[] = [];
  let slotWater = 0;
  let curFn: FnDecl | null = null;
  let retLabel = "";
  const breaks: string[] = [];
  const conts: string[] = [];

  const findLocal = (name: string): Local | null => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const l = scopes[i]!.get(name);
      if (l !== undefined) return l;
    }
    return null;
  };
  const argIndex = (name: string): number =>
    curFn?.params.findIndex((pp) => pp.name === name) ?? -1;

  /** The struct an expression's value addresses, or null. A pointer to an S
      and an S held by value both answer S — both are an address of one. */
  const structOf = (e: Expr): string | null => {
    switch (e.kind) {
      case "id": {
        const l = findLocal(e.name);
        if (l) return l.s;
        const ai = argIndex(e.name);
        if (ai >= 0) return curFn!.params[ai]!.s;
        return globalByName.get(e.name)?.s ?? null;
      }
      case "field": {
        const s = structOf(e.base);
        return s ? (structs.get(s)?.fields.find((f) => f.name === e.name)?.s ?? null) : null;
      }
      case "call":
        return fnByName.get(e.name)?.retS ?? null;
      case "un":
        return e.op === "*" ? structOf(e.e) : null;
      case "index":
        return structOf(e.base);
      case "assign":
        return structOf(e.lv);
      case "cond":
        return structOf(e.t) ?? structOf(e.f);
      default:
        return null;
    }
  };

  /** r0 = the address of an lvalue (or of an array/string, which is a value). */
  function emitAddr(e: Expr): void {
    if (e.kind === "id") {
      const l = findLocal(e.name);
      if (l) {
        ln(`mov r0, r5`);
        ln(`sub r0, ${l.size === null ? 1 + l.slot : l.slot + l.size}`);
        return;
      }
      const ai = argIndex(e.name);
      if (ai >= 0) {
        ln(`mov r0, r5`);
        ln(`add r0, ${curFn!.params.length - ai}`);
        return;
      }
      const g = globalByName.get(e.name);
      if (g) {
        ln(`mov r0, g_${e.name}`);
        return;
      }
      errors.push({ line: e.line, msg: `Unknown name: ${e.name}` });
      ln(`mov r0, 0`);
      return;
    }
    if (e.kind === "un" && e.op === "*") {
      emitExpr(e.e);
      return;
    }
    if (e.kind === "index") {
      emitExpr(e.base);
      ln(`push r0`);
      emitExpr(e.idx);
      ln(`mov r1, r0`);
      ln(`pop r0`);
      ln(`add r0, r1`);
      return;
    }
    if (e.kind === "field") {
      // the base's value is the struct's address, whether it was a pointer
      // or the struct itself; the field is an offset on top
      const s = structOf(e.base);
      emitExpr(e.base);
      if (!s) {
        errors.push({ line: e.line, msg: `Only a struct has a field: ${e.name}` });
        return;
      }
      const off = structs.get(s)!.fields.findIndex((f) => f.name === e.name);
      if (off < 0) {
        errors.push({ line: e.line, msg: `No field ${e.name} in struct ${s}` });
        return;
      }
      if (off) ln(`add r0, ${off}`);
      return;
    }
    errors.push({ line: e.line, msg: "That cannot be assigned to" });
    ln(`mov r0, 0`);
  }

  /** Ids whose value is their address: arrays, and structs held by value. */
  const isArray = (e: Expr): boolean => {
    if (e.kind !== "id") return false;
    const l = findLocal(e.name);
    if (l) return l.size !== null;
    const g = globalByName.get(e.name);
    return g ? g.size !== null || g.val : false;
  };

  /** cmp with signed meaning: biases both sides so JC reads as "less than". */
  function signedCmp(a: "r0" | "r1", b: "r0" | "r1"): void {
    ln(`xor r0, 0x8000`);
    ln(`xor r1, 0x8000`);
    ln(`cmp ${a}, ${b}`);
  }

  function emitCompare(op: string): void {
    // operands: l in r0, r r1. Result 0/1 in r0. MOV keeps flags, so the
    // answer can be staged before the jump reads them.
    const t = label();
    if (op === "==" || op === "!=") {
      // the jump fires exactly when the answer is no, so 0 rides the jump
      ln(`cmp r0, r1`);
      ln(`mov r0, 0`);
      ln(`${op === "==" ? "jnz" : "jz"} ${t}`);
      ln(`mov r0, 1`);
      ln(`${t}:`);
      return;
    }
    // carry after cmp A,B is unsigned A<B; biased, it is signed A<B
    const flip = op === ">" || op === "<=";
    const wantCarry = op === "<" || op === ">";
    signedCmp(flip ? "r1" : "r0", flip ? "r0" : "r1");
    ln(`mov r0, 1`);
    ln(`${wantCarry ? "jc" : "jnc"} ${t}`);
    ln(`mov r0, 0`);
    ln(`${t}:`);
  }

  function emitBinOp(op: string, line: number): void {
    // operands: left r0, right r1
    switch (op) {
      case "+": ln(`add r0, r1`); return;
      case "-": ln(`sub r0, r1`); return;
      case "*": ln(`mul r0, r1`); return;
      case "&": ln(`and r0, r1`); return;
      case "|": ln(`or r0, r1`); return;
      case "^": ln(`xor r0, r1`); return;
      case "<<": ln(`shl r0, r1`); return;
      case ">>": ln(`shr r0, r1`); return;
      case "/":
        rt.add("div");
        ln(`call rt_div`);
        return;
      case "%":
        rt.add("mod");
        ln(`call rt_mod`);
        return;
      default:
        if (["==", "!=", "<", ">", "<=", ">="].includes(op)) {
          emitCompare(op);
          return;
        }
        errors.push({ line, msg: `Cannot compile operator: ${op}` });
    }
  }

  function emitCall(e: Extract<Expr, { kind: "call" }>): void {
    const arity: Record<string, number> = {
      putc: 1, putn: 1, puts: 1, getc: 0, key: 0, rand: 0,
      vpos: 1, vput: 1, vsync: 0, malloc: 1, free: 1,
    };
    if (BUILTINS.has(e.name)) {
      if (e.args.length !== arity[e.name])
        errors.push({ line: e.line, msg: `${e.name} takes ${arity[e.name]} argument(s)` });
      if (e.args[0]) emitExpr(e.args[0]);
      switch (e.name) {
        case "putc": ln(`st r0, [con]`); return;
        case "putn": ln(`st r0, [num]`); return;
        case "key": ln(`ld r0, [key]`); return;
        case "rand": ln(`ld r0, [rnd]`); return;
        case "vpos": ln(`st r0, [vpos]`); return;
        case "vput": ln(`st r0, [vchr]`); return;
        case "vsync": ln(`ld r0, [vsync]`); return;
        case "malloc":
          rt.add("malloc");
          ln(`call rt_malloc`);
          return;
        case "free":
          // accepted, and nothing happens. The heap does not take things back.
          return;
        case "getc": {
          const t = label();
          ln(`${t}:`);
          ln(`ld r0, [key]`);
          ln(`cmp r0, 0`);
          ln(`jz ${t}`);
          return;
        }
        case "puts":
          rt.add("puts");
          ln(`mov r1, r0`);
          ln(`call rt_puts`);
          return;
      }
    }
    const fn = fnByName.get(e.name);
    if (!fn) {
      errors.push({ line: e.line, msg: `Unknown function: ${e.name}` });
      ln(`mov r0, 0`);
      return;
    }
    if (fn.params.length !== e.args.length)
      errors.push({ line: e.line, msg: `${e.name} takes ${fn.params.length} argument(s)` });
    for (const a of e.args) {
      emitExpr(a);
      ln(`sub r7, 1`);
      ln(`st r0, [r7]`);
    }
    ln(`call fn_${e.name}`);
    if (e.args.length) ln(`add r7, ${e.args.length}`);
  }

  /** r0 = the value of the expression. */
  function emitExpr(e: Expr): void {
    switch (e.kind) {
      case "num":
        ln(`mov r0, ${imm(e.value)}`);
        return;
      case "str":
        ln(`mov r0, s${e.index}`);
        return;
      case "id":
        if (isArray(e)) {
          emitAddr(e);
          return;
        }
        emitAddr(e);
        ln(`mov r6, r0`);
        ln(`ld r0, [r6]`);
        return;
      case "un":
        if (e.op === "&") {
          emitAddr(e.e);
          return;
        }
        emitExpr(e.e);
        if (e.op === "*") {
          ln(`mov r6, r0`);
          ln(`ld r0, [r6]`);
        } else if (e.op === "-") {
          ln(`xor r0, 0xffff`);
          ln(`add r0, 1`);
        } else if (e.op === "~") {
          ln(`xor r0, 0xffff`);
        } else if (e.op === "!") {
          const t = label();
          ln(`cmp r0, 0`);
          ln(`mov r0, 1`);
          ln(`jz ${t}`);
          ln(`mov r0, 0`);
          ln(`${t}:`);
        }
        return;
      case "bin": {
        if (e.op === "&&" || e.op === "||") {
          const short = label();
          const end = label();
          emitExpr(e.l);
          ln(`cmp r0, 0`);
          ln(`${e.op === "&&" ? "jz" : "jnz"} ${short}`);
          emitExpr(e.r);
          ln(`cmp r0, 0`);
          ln(`${e.op === "&&" ? "jz" : "jnz"} ${short}`);
          ln(`mov r0, ${e.op === "&&" ? 1 : 0}`);
          ln(`jmp ${end}`);
          ln(`${short}:`);
          ln(`mov r0, ${e.op === "&&" ? 0 : 1}`);
          ln(`${end}:`);
          return;
        }
        emitExpr(e.l);
        ln(`push r0`);
        emitExpr(e.r);
        ln(`mov r1, r0`);
        ln(`pop r0`);
        emitBinOp(e.op, e.line);
        return;
      }
      case "cond": {
        const no = label();
        const end = label();
        emitExpr(e.c);
        ln(`cmp r0, 0`);
        ln(`jz ${no}`);
        emitExpr(e.t);
        ln(`jmp ${end}`);
        ln(`${no}:`);
        emitExpr(e.f);
        ln(`${end}:`);
        return;
      }
      case "assign": {
        emitAddr(e.lv);
        ln(`push r0`);
        if (e.op === "=") {
          emitExpr(e.e);
          ln(`pop r6`);
          ln(`st r0, [r6]`);
        } else {
          ln(`mov r6, r0`);
          ln(`ld r0, [r6]`);
          ln(`push r0`);
          emitExpr(e.e);
          ln(`mov r1, r0`);
          ln(`pop r0`);
          emitBinOp(e.op.slice(0, -1), e.line);
          ln(`pop r6`);
          ln(`st r0, [r6]`);
        }
        return;
      }
      case "incdec": {
        emitAddr(e.lv);
        ln(`push r0`);
        ln(`mov r6, r0`);
        ln(`ld r0, [r6]`);
        ln(`push r0`);
        ln(`${e.op === "++" ? "add" : "sub"} r0, 1`);
        ln(`pop r1`);
        ln(`pop r6`);
        ln(`st r0, [r6]`);
        if (!e.pre) ln(`mov r0, r1`);
        return;
      }
      case "index":
      case "field":
        emitAddr(e);
        ln(`mov r6, r0`);
        ln(`ld r0, [r6]`);
        return;
      case "call":
        emitCall(e);
        return;
    }
  }

  function emitStmt(s: Stmt): void {
    switch (s.kind) {
      case "empty":
        return;
      case "expr":
        emitExpr(s.e);
        return;
      case "asm":
        for (const line of s.text.split("\n")) out.push(`        ${line.trim()}`);
        return;
      case "decl":
        for (const d of s.names) {
          const scope = scopes[scopes.length - 1]!;
          if (scope.has(d.name) || argIndex(d.name) >= 0)
            errors.push({ line: d.line, msg: `Defined twice: ${d.name}` });
          const slot = slotWater;
          slotWater += d.words;
          scope.set(d.name, {
            slot,
            size: d.size !== null || d.val ? d.words : null,
            s: d.s,
          });
          if (d.init) {
            emitExpr(d.init);
            ln(`mov r6, r5`);
            ln(`sub r6, ${1 + slot}`);
            ln(`st r0, [r6]`);
          }
          if (d.list) {
            // element i of the array at fp-(slot+words) is fp-(slot+words-i).
            // The whole array is written: the pad is zeros, as C promises,
            // and stack slots arrive holding whatever died there last.
            for (let i = 0; i < d.words; i++) {
              ln(`mov r0, ${imm(d.list[i] ?? 0)}`);
              ln(`mov r6, r5`);
              ln(`sub r6, ${slot + d.words - i}`);
              ln(`st r0, [r6]`);
            }
          }
        }
        return;
      case "block":
        scopes.push(new Map());
        s.body.forEach(emitStmt);
        scopes.pop();
        return;
      case "if": {
        const no = label();
        emitExpr(s.c);
        ln(`cmp r0, 0`);
        ln(`jz ${no}`);
        emitStmt(s.t);
        if (s.f) {
          const end = label();
          ln(`jmp ${end}`);
          ln(`${no}:`);
          emitStmt(s.f);
          ln(`${end}:`);
        } else ln(`${no}:`);
        return;
      }
      case "while": {
        const top = label();
        const end = label();
        ln(`${top}:`);
        emitExpr(s.c);
        ln(`cmp r0, 0`);
        ln(`jz ${end}`);
        breaks.push(end);
        conts.push(top);
        emitStmt(s.body);
        breaks.pop();
        conts.pop();
        ln(`jmp ${top}`);
        ln(`${end}:`);
        return;
      }
      case "do": {
        const top = label();
        const cond = label();
        const end = label();
        ln(`${top}:`);
        breaks.push(end);
        conts.push(cond);
        emitStmt(s.body);
        breaks.pop();
        conts.pop();
        ln(`${cond}:`);
        emitExpr(s.c);
        ln(`cmp r0, 0`);
        ln(`jnz ${top}`);
        ln(`${end}:`);
        return;
      }
      case "for": {
        const top = label();
        const step = label();
        const end = label();
        if (s.init) emitExpr(s.init);
        ln(`${top}:`);
        if (s.c) {
          emitExpr(s.c);
          ln(`cmp r0, 0`);
          ln(`jz ${end}`);
        }
        breaks.push(end);
        conts.push(step);
        emitStmt(s.body);
        breaks.pop();
        conts.pop();
        ln(`${step}:`);
        if (s.step) emitExpr(s.step);
        ln(`jmp ${top}`);
        ln(`${end}:`);
        return;
      }
      case "return":
        if (s.e) emitExpr(s.e);
        else ln(`mov r0, 0`);
        ln(`jmp ${retLabel}`);
        return;
      case "break":
        if (!breaks.length) errors.push({ line: s.line, msg: "break has nothing to break out of" });
        else ln(`jmp ${breaks[breaks.length - 1]}`);
        return;
      case "continue":
        if (!conts.length) errors.push({ line: s.line, msg: "continue has no loop to continue" });
        else ln(`jmp ${conts[conts.length - 1]}`);
        return;
    }
  }

  /* ---- the program image: startup, functions, runtime, data ---- */
  ln(`; made by CC. The processor runs this, not the C.`);
  ln(`mov r7, 0x${DATA_STACK_TOP.toString(16)}`);
  ln(`call fn_main`);
  ln(`hlt`);

  for (const f of fns) {
    curFn = f;
    scopes = [new Map()];
    slotWater = 0;
    retLabel = `fn_${f.name}_ret`;
    const nslots = countSlots(f.body);
    ln(`; --- ${f.name}(${f.params.map((pp) => pp.name).join(", ")})`);
    ln(`fn_${f.name}:`);
    ln(`sub r7, 1`);
    ln(`st r5, [r7]`);
    ln(`mov r5, r7`);
    if (nslots) ln(`sub r7, ${nslots}`);
    f.body.forEach(emitStmt);
    ln(`mov r0, 0`);
    ln(`${retLabel}:`);
    ln(`mov r7, r5`);
    ln(`ld r5, [r7]`);
    ln(`add r7, 1`);
    ln(`ret`);
  }

  if (rt.has("malloc")) {
    // a bump allocator: the heap starts where the image ends and only grows.
    // Fresh memory is zeroed because nothing has ever been there. It shares
    // the room with the stacks and nobody referees — like the period.
    ln(`; --- runtime: the heap. It grows and does not give back.`);
    ln(`rt_malloc:`);
    ln(`ld r1, [rt_hp]`);
    ln(`add r0, r1`);
    ln(`st r0, [rt_hp]`);
    ln(`mov r0, r1`);
    ln(`ret`);
    out.push(`rt_hp:  .word heap0`);
  }
  if (rt.has("puts")) {
    ln(`; --- runtime: write the zero-ended string at r1`);
    ln(`rt_puts:`);
    ln(`ld r2, [r1]`);
    ln(`cmp r2, 0`);
    ln(`jz rt_puts_d`);
    ln(`st r2, [con]`);
    ln(`add r1, 1`);
    ln(`jmp rt_puts`);
    ln(`rt_puts_d:`);
    ln(`ret`);
  }
  if (rt.has("div") || rt.has("mod")) {
    // the hardware divides unsigned; C divides signed. Quotient sign is the
    // XOR of the operand signs; the remainder follows the dividend, as K&R.
    for (const which of ["div", "mod"] as const) {
      if (!rt.has(which)) continue;
      ln(`; --- runtime: signed ${which === "div" ? "division" : "remainder"}`);
      ln(`rt_${which}:`);
      ln(`mov r2, 0`);
      ln(`mov r3, r0`);
      ln(`and r3, 0x8000`);
      ln(`jz rt_${which}_a`);
      ln(`xor r0, 0xffff`);
      ln(`add r0, 1`);
      ln(`mov r2, ${which === "div" ? 1 : 1}`);
      ln(`rt_${which}_a:`);
      ln(`mov r3, r1`);
      ln(`and r3, 0x8000`);
      ln(`jz rt_${which}_b`);
      ln(`xor r1, 0xffff`);
      ln(`add r1, 1`);
      if (which === "div") ln(`xor r2, 1`);
      ln(`rt_${which}_b:`);
      ln(`${which} r0, r1`);
      ln(`cmp r2, 0`);
      ln(`jz rt_${which}_d`);
      ln(`xor r0, 0xffff`);
      ln(`add r0, 1`);
      ln(`rt_${which}_d:`);
      ln(`ret`);
    }
  }

  /* ---- data ---- */
  strings.forEach((s, i) => {
    const safe = [...s].every((c) => {
      const v = c.charCodeAt(0);
      return (v >= 32 && v < 127) || v === 10;
    });
    if (safe) {
      out.push(`s${i}:    .str "${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`);
    } else {
      const words = [...s].map((c) => c.charCodeAt(0) & 0xffff);
      words.push(0);
      out.push(`s${i}:    .word ${words.join(", ")}`);
    }
  });
  for (const g of globals) {
    if (g.list) {
      const words = [...g.list];
      while (words.length < g.words) words.push(0);
      out.push(`g_${g.name}: .word ${words.join(", ")}`);
    } else if (g.size !== null || g.val) out.push(`g_${g.name}: .space ${g.words}`);
    else if (g.init === null || g.init === 0) out.push(`g_${g.name}: .word 0`);
    else if (typeof g.init === "number") out.push(`g_${g.name}: .word ${g.init}`);
    else out.push(`g_${g.name}: .word s${g.init.str}`);
  }
  // the heap begins where the program ends — this word is its first
  if (rt.has("malloc")) out.push(`heap0:  .word 0`);

  if (errors.length) return { ok: false, errors };
  return { ok: true, asm: out.join("\n") };
}
