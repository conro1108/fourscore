/**
 * The machine's own processor: a 16-bit CPU and its assembler, pure logic,
 * no DOM anywhere. The law ("don't draw the OS — run it") is why this file
 * exists at all: a terminal that pretended to run programs would be a poster
 * of a computer. This one assembles source to real machine words and decodes
 * them one fetch at a time, so self-modifying code works because nothing
 * stops it working.
 *
 * The ISA (documented for the player in asm.txt on the disk — the seed in
 * copy.ts and this file must agree, and the test assembles the shipped
 * example programs to hold them together):
 *
 *   Memory   4096 16-bit words. Programs load at 0. The top page (0x0F00+)
 *            is the hardware:
 *              0x0F00 CON   write a character code, it prints
 *              0x0F01 NUM   write a value, it prints as a signed number
 *              0x0F02 KEY   read the next typed character, 0 if none
 *              0x0F03 RND   read 16 random bits
 *              0x0F04 VPOS  the screen cursor, a cell 0..959 (40x24,
 *                           row-major). Writes wrap; reads answer it
 *              0x0F05 VCHR  write a character, it lands at the cursor and
 *                           the cursor moves on. Reading answers the cell.
 *                           The first write turns the screen on
 *              0x0F06 VSYNC read it and the processor rests until the next
 *                           frame of the display; the value counts frames
 *              0x0F07 DPOS  the drive head's address, low word
 *              0x0F08 DBNK  the same address, high word
 *              0x0F09 DSK   read a byte from the drive and the head moves
 *                           on; write one and the same. Past the end of the
 *                           media a read is 0 and a write goes nowhere
 *   Regs     R0..R7, plus PC and a stack pointer. The stack starts at
 *            0x0F00 and grows down through ordinary RAM.
 *   Flags    Z (zero), N (bit 15), C (carry / borrow). CMP is a subtract
 *            that keeps the flags and throws away the result; JC after a
 *            CMP is "unsigned less than".
 *
 * Encoding: [op:6][a:3][b:3][imm:1][unused:3]. When the imm bit is set the
 * source operand is the next word; otherwise it is register b. One shape,
 * one decode — the assembler and the CPU share the table below.
 */

export const MEM_SIZE = 4096;
export const MMIO_BASE = 0x0f00;
export const PORT_CON = 0x0f00;
export const PORT_NUM = 0x0f01;
export const PORT_KEY = 0x0f02;
export const PORT_RND = 0x0f03;
export const PORT_VPOS = 0x0f04;
export const PORT_VCHR = 0x0f05;
export const PORT_VSYNC = 0x0f06;
export const PORT_DPOS = 0x0f07;
export const PORT_DBNK = 0x0f08;
export const PORT_DSK = 0x0f09;
export const SCREEN_W = 40;
export const SCREEN_H = 24;
export const SCREEN_CELLS = SCREEN_W * SCREEN_H;
const SP_INIT = MMIO_BASE;

/* ---- the instruction set, shared by assembler and CPU ---- */

type Shape =
  | "rd_src" // OP Ra, Rb|imm
  | "mem" // OP Ra, [Rb|imm]
  | "src" // OP Rb|imm
  | "rd" // OP Ra
  | "none";

const OPS: Record<string, { code: number; shape: Shape }> = {
  HLT: { code: 0, shape: "none" },
  MOV: { code: 1, shape: "rd_src" },
  ADD: { code: 2, shape: "rd_src" },
  SUB: { code: 3, shape: "rd_src" },
  MUL: { code: 4, shape: "rd_src" },
  DIV: { code: 5, shape: "rd_src" },
  MOD: { code: 6, shape: "rd_src" },
  AND: { code: 7, shape: "rd_src" },
  OR: { code: 8, shape: "rd_src" },
  XOR: { code: 9, shape: "rd_src" },
  SHL: { code: 10, shape: "rd_src" },
  SHR: { code: 11, shape: "rd_src" },
  CMP: { code: 12, shape: "rd_src" },
  LD: { code: 13, shape: "mem" },
  ST: { code: 14, shape: "mem" },
  JMP: { code: 15, shape: "src" },
  JZ: { code: 16, shape: "src" },
  JNZ: { code: 17, shape: "src" },
  JC: { code: 18, shape: "src" },
  JNC: { code: 19, shape: "src" },
  JN: { code: 20, shape: "src" },
  JNN: { code: 21, shape: "src" },
  CALL: { code: 22, shape: "src" },
  RET: { code: 23, shape: "none" },
  PUSH: { code: 24, shape: "src" },
  POP: { code: 25, shape: "rd" },
  NOP: { code: 26, shape: "none" },
};

const CODE_TO_OP = new Map(Object.entries(OPS).map(([name, o]) => [o.code, { name, ...o }]));

/** The hardware's names, usable anywhere a number is. A user label wins. */
const PORTS: Record<string, number> = {
  CON: PORT_CON,
  NUM: PORT_NUM,
  KEY: PORT_KEY,
  RND: PORT_RND,
  VPOS: PORT_VPOS,
  VCHR: PORT_VCHR,
  VSYNC: PORT_VSYNC,
  DPOS: PORT_DPOS,
  DBNK: PORT_DBNK,
  DSK: PORT_DSK,
};

/* ---- assembler ---- */

export interface AsmError {
  line: number;
  msg: string;
}

export type AsmResult = { ok: true; words: Uint16Array } | { ok: false; errors: AsmError[] };

interface Item {
  line: number;
  addr: number;
  kind: "instr" | "word" | "str" | "space";
  op?: string;
  operands: string[];
  strText?: string;
}

const REG_RE = /^r[0-7]$/i;

function parseChar(tok: string): number | null {
  const m = /^'(\\?.)'$/.exec(tok);
  if (!m) return null;
  const c = m[1]!;
  if (c === "\\n") return 10;
  if (c === "\\\\") return 92;
  if (c === "\\'") return 39;
  return c.length === 1 ? c.charCodeAt(0) : null;
}

function parseNum(tok: string): number | null {
  if (/^-?0x[0-9a-f]+$/i.test(tok) || /^-?\d+$/.test(tok)) {
    const n = Number(tok);
    return Number.isSafeInteger(n) && n >= -0x8000 && n <= 0xffff ? n & 0xffff : null;
  }
  return null;
}

function parseStr(raw: string): string | null {
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(raw.trim());
  if (!m) return null;
  return m[1]!.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

export function assemble(src: string): AsmResult {
  const errors: AsmError[] = [];
  const labels = new Map<string, number>();
  const items: Item[] = [];
  let addr = 0;

  // pass 1: parse lines, size everything, place labels
  src.split("\n").forEach((rawLine, i) => {
    const line = i + 1;
    let text = rawLine.replace(/;.*/, "").trim();
    let m: RegExpExecArray | null;
    while ((m = /^([A-Za-z_]\w*):\s*/.exec(text))) {
      const name = m[1]!.toLowerCase();
      if (labels.has(name)) errors.push({ line, msg: `Label defined twice: ${m[1]}` });
      // shadowing a port would silently read the label instead of the hardware
      if (PORTS[name.toUpperCase()] !== undefined)
        errors.push({ line, msg: `That name belongs to the hardware: ${m[1]}` });
      labels.set(name, addr);
      text = text.slice(m[0].length);
    }
    if (!text) return;

    const sp = text.search(/\s/);
    const head = (sp === -1 ? text : text.slice(0, sp)).toUpperCase();
    const rest = sp === -1 ? "" : text.slice(sp).trim();

    if (head === ".WORD") {
      const operands = rest.split(",").map((s) => s.trim());
      if (!rest) errors.push({ line, msg: ".word needs a value" });
      items.push({ line, addr, kind: "word", operands });
      addr += operands.length;
    } else if (head === ".STR") {
      const s = parseStr(rest);
      if (s === null) {
        errors.push({ line, msg: '.str needs a "quoted string"' });
        items.push({ line, addr, kind: "str", operands: [], strText: "" });
      } else {
        items.push({ line, addr, kind: "str", operands: [], strText: s });
        addr += s.length + 1; // terminating zero
      }
    } else if (head === ".SPACE") {
      const n = parseNum(rest);
      if (n === null || n > MEM_SIZE) {
        errors.push({ line, msg: ".space needs a size" });
      } else {
        items.push({ line, addr, kind: "space", operands: [String(n)] });
        addr += n;
      }
    } else if (OPS[head]) {
      const operands = rest ? rest.split(",").map((s) => s.trim()) : [];
      const item: Item = { line, addr, kind: "instr", op: head, operands };
      items.push(item);
      addr += 1 + (instrImmediate(item) ? 1 : 0);
    } else {
      errors.push({ line, msg: `Unknown instruction: ${head}` });
    }
  });

  if (addr > MMIO_BASE)
    errors.push({ line: 0, msg: `Program too large: ${addr} words (the RAM ends at ${MMIO_BASE})` });

  /** Whether the source operand needs an immediate word (pass 1 sizing). */
  function instrImmediate(item: Item): boolean {
    const shape = OPS[item.op!]!.shape;
    const srcTok =
      shape === "rd_src" ? item.operands[1] : shape === "src" || shape === "mem" ? stripBrackets(item.operands[shape === "mem" ? 1 : 0] ?? "") : null;
    if (srcTok === null || srcTok === undefined) return false;
    return !REG_RE.test(srcTok);
  }

  function stripBrackets(tok: string): string {
    const m = /^\[(.*)\]$/.exec(tok.trim());
    return m ? m[1]!.trim() : tok.trim();
  }

  function resolveValue(tok: string, line: number): number {
    const n = parseNum(tok) ?? parseChar(tok);
    if (n !== null) return n;
    const label = labels.get(tok.toLowerCase());
    if (label !== undefined) return label;
    const port = PORTS[tok.toUpperCase()];
    if (port !== undefined) return port;
    if (REG_RE.test(tok)) errors.push({ line, msg: `A register can't go there: ${tok}` });
    else errors.push({ line, msg: `Unknown name: ${tok}` });
    return 0;
  }

  function resolveReg(tok: string | undefined, line: number): number {
    if (tok !== undefined && REG_RE.test(tok)) return Number(tok.slice(1));
    errors.push({ line, msg: `Expected a register (R0..R7), got: ${tok ?? "nothing"}` });
    return 0;
  }

  // pass 2: emit
  const words: number[] = [];
  for (const item of items) {
    const { line } = item;
    if (item.kind === "word") {
      for (const tok of item.operands) words.push(resolveValue(tok, line));
      continue;
    }
    if (item.kind === "str") {
      for (const ch of item.strText!) words.push(ch.charCodeAt(0) & 0xffff);
      words.push(0);
      continue;
    }
    if (item.kind === "space") {
      for (let i = 0; i < Number(item.operands[0]); i++) words.push(0);
      continue;
    }
    const spec = OPS[item.op!]!;
    const want =
      spec.shape === "rd_src" || spec.shape === "mem" ? 2 : spec.shape === "none" ? 0 : 1;
    if (item.operands.length !== want) {
      errors.push({ line, msg: `${item.op} takes ${want} operand${want === 1 ? "" : "s"}` });
      words.push(spec.code << 10);
      continue;
    }
    let a = 0;
    let srcTok: string | null = null;
    if (spec.shape === "rd_src") {
      a = resolveReg(item.operands[0], line);
      srcTok = item.operands[1]!;
    } else if (spec.shape === "mem") {
      a = resolveReg(item.operands[0], line);
      const memTok = item.operands[1]!.trim();
      if (!/^\[.*\]$/.test(memTok)) errors.push({ line, msg: `${item.op} needs [brackets] around the address` });
      srcTok = stripBrackets(memTok);
    } else if (spec.shape === "src") {
      srcTok = item.operands[0]!;
    } else if (spec.shape === "rd") {
      a = resolveReg(item.operands[0], line);
    }
    if (srcTok !== null && REG_RE.test(srcTok)) {
      words.push((spec.code << 10) | (a << 7) | (Number(srcTok.slice(1)) << 4));
    } else if (srcTok !== null) {
      words.push((spec.code << 10) | (a << 7) | 8);
      words.push(resolveValue(srcTok, line));
    } else {
      words.push((spec.code << 10) | (a << 7));
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, words: Uint16Array.from(words) };
}

/* ---- the CPU ---- */

export interface VmIO {
  putChar(code: number): void;
  putNum(value: number): void;
  /** Next typed character code, or 0 — the KEY port. */
  key(): number;
  /** 16 random bits — the RND port. */
  rand(): number;
  /**
   * The drive's media, asked for once, the first time a program touches the
   * drive — a program that never does pays nothing. Null is an empty bay,
   * which reads as zeros rather than faulting, the way an empty drive did.
   *
   * The bytes are the drive: writes land in them and are not written back to
   * anything, so a program can use the room past its data as scratch and the
   * media is whole again next time it is mounted.
   */
  drive?(): Uint8Array | null;
}

export interface Vm {
  readonly mem: Uint16Array;
  readonly regs: Uint16Array;
  /** The 40x24 character screen, row-major. Cells hold what was written. */
  readonly screen: Uint16Array;
  /** The screen lights at the first VCHR write and stays lit. */
  screenOn: boolean;
  pc: number;
  sp: number;
  halted: boolean;
  /** A period fault message, or null while the program is behaving. */
  fault: string | null;
  /** Execute up to `maxSteps` instructions; returns how many ran. Each call
      is one frame of the display: a VSYNC read ends the call early, which is
      how a program rests until the next one. */
  run(maxSteps: number): number;
}

const hex = (n: number): string => `0x${n.toString(16).padStart(4, "0").toUpperCase()}`;

export function makeVm(program: Uint16Array | readonly number[], io: VmIO): Vm {
  const mem = new Uint16Array(MEM_SIZE);
  mem.set(program.slice(0, MEM_SIZE));
  const regs = new Uint16Array(8);
  let z = false;
  let n = false;
  let c = false;
  const screen = new Uint16Array(SCREEN_CELLS);
  let vpos = 0; // the screen cursor
  let frame = 0; // one per run() call — the display's clock
  let rested = false; // a VSYNC read ends the frame's turn
  let dpos = 0; // the drive head, a byte address across DBNK:DPOS
  let media: Uint8Array | null | undefined; // undefined until the bay is asked
  const mounted = (): Uint8Array | null => {
    if (media === undefined) media = io.drive?.() ?? null;
    return media;
  };

  const vm: Vm = {
    mem,
    regs,
    screen,
    screenOn: false,
    pc: 0,
    sp: SP_INIT,
    halted: false,
    fault: null,
    run(maxSteps: number): number {
      frame = (frame + 1) & 0xffff;
      rested = false;
      let steps = 0;
      while (steps < maxSteps && !vm.halted && vm.fault === null && !rested) {
        step();
        steps++;
      }
      return steps;
    },
  };

  const setZN = (v: number): number => {
    z = v === 0;
    n = (v & 0x8000) !== 0;
    return v;
  };

  function fetch(): number {
    if (vm.pc >= MEM_SIZE) {
      vm.fault = `Memory fault at ${hex(vm.pc)}`;
      return 0;
    }
    return mem[vm.pc++]!;
  }

  function load(addr: number): number {
    if (addr >= MEM_SIZE) {
      vm.fault = `Memory fault at ${hex(addr)}`;
      return 0;
    }
    if (addr === PORT_KEY) return io.key() & 0xffff;
    if (addr === PORT_RND) return io.rand() & 0xffff;
    if (addr === PORT_VPOS) return vpos;
    if (addr === PORT_VCHR) return screen[vpos]!;
    if (addr === PORT_VSYNC) {
      rested = true;
      return frame;
    }
    if (addr === PORT_DPOS) return dpos & 0xffff;
    if (addr === PORT_DBNK) return (dpos >>> 16) & 0xffff;
    if (addr === PORT_DSK) {
      const m = mounted();
      const v = m !== null && dpos < m.length ? m[dpos]! : 0;
      dpos = (dpos + 1) >>> 0;
      return v;
    }
    if (addr === PORT_CON || addr === PORT_NUM) return 0; // write-only hardware
    return mem[addr]!;
  }

  function store(addr: number, v: number): void {
    if (addr >= MEM_SIZE) {
      vm.fault = `Memory fault at ${hex(addr)}`;
      return;
    }
    if (addr === PORT_CON) io.putChar(v & 0xffff);
    else if (addr === PORT_NUM) io.putNum(v >= 0x8000 ? v - 0x10000 : v);
    else if (addr === PORT_VPOS) vpos = v % SCREEN_CELLS;
    else if (addr === PORT_VCHR) {
      screen[vpos] = v;
      vm.screenOn = true;
      vpos = (vpos + 1) % SCREEN_CELLS;
    } else if (addr === PORT_DPOS) dpos = ((dpos & 0xffff0000) | v) >>> 0;
    else if (addr === PORT_DBNK) dpos = (((v & 0xffff) * 0x10000 + (dpos & 0xffff)) >>> 0);
    else if (addr === PORT_DSK) {
      const m = mounted();
      if (m !== null && dpos < m.length) m[dpos] = v & 0xff;
      dpos = (dpos + 1) >>> 0;
    } else if (addr === PORT_VSYNC) {
      // read-only hardware; the write lands nowhere
    } else mem[addr] = v;
  }

  function push(v: number): void {
    if (vm.sp <= 0) {
      vm.fault = "Stack fault";
      return;
    }
    vm.sp--;
    mem[vm.sp] = v & 0xffff;
  }

  function pop(): number {
    if (vm.sp >= SP_INIT) {
      vm.fault = "Stack fault";
      return 0;
    }
    return mem[vm.sp++]!;
  }

  function step(): void {
    const at = vm.pc;
    const word = fetch();
    if (vm.fault) return;
    const code = word >> 10;
    const a = (word >> 7) & 7;
    const b = (word >> 4) & 7;
    const imm = (word & 8) !== 0;
    const spec = CODE_TO_OP.get(code);
    if (!spec) {
      vm.fault = `Invalid opcode at ${hex(at)}`;
      return;
    }
    const src = spec.shape === "none" || spec.shape === "rd" ? 0 : imm ? fetch() : regs[b]!;
    if (vm.fault) return;
    const ra = regs[a]!;

    switch (spec.name) {
      case "HLT":
        vm.halted = true;
        break;
      case "NOP":
        break;
      case "MOV":
        regs[a] = src;
        break;
      case "ADD": {
        const r = ra + src;
        c = r > 0xffff;
        regs[a] = setZN(r & 0xffff);
        break;
      }
      case "SUB": {
        c = src > ra;
        regs[a] = setZN((ra - src) & 0xffff);
        break;
      }
      case "MUL": {
        const r = ra * src;
        c = r > 0xffff;
        regs[a] = setZN(r & 0xffff);
        break;
      }
      case "DIV":
      case "MOD":
        if (src === 0) {
          vm.fault = "Divide overflow";
          break;
        }
        c = false;
        regs[a] = setZN(spec.name === "DIV" ? Math.floor(ra / src) : ra % src);
        break;
      case "AND":
        c = false;
        regs[a] = setZN(ra & src);
        break;
      case "OR":
        c = false;
        regs[a] = setZN(ra | src);
        break;
      case "XOR":
        c = false;
        regs[a] = setZN(ra ^ src);
        break;
      case "SHL": {
        const sh = src & 31;
        c = sh > 0 && sh <= 16 ? ((ra << (sh - 1)) & 0x8000) !== 0 : sh > 16 ? false : c;
        regs[a] = setZN(sh >= 16 ? 0 : (ra << sh) & 0xffff);
        break;
      }
      case "SHR": {
        const sh = src & 31;
        c = sh > 0 && sh <= 16 ? ((ra >> (sh - 1)) & 1) !== 0 : sh > 16 ? false : c;
        regs[a] = setZN(sh >= 16 ? 0 : ra >> sh);
        break;
      }
      case "CMP":
        c = src > ra;
        setZN((ra - src) & 0xffff);
        break;
      case "LD":
        regs[a] = load(src);
        break;
      case "ST":
        store(src, ra);
        break;
      case "JMP":
        vm.pc = src;
        break;
      case "JZ":
        if (z) vm.pc = src;
        break;
      case "JNZ":
        if (!z) vm.pc = src;
        break;
      case "JC":
        if (c) vm.pc = src;
        break;
      case "JNC":
        if (!c) vm.pc = src;
        break;
      case "JN":
        if (n) vm.pc = src;
        break;
      case "JNN":
        if (!n) vm.pc = src;
        break;
      case "CALL":
        push(vm.pc);
        if (!vm.fault) vm.pc = src;
        break;
      case "RET":
        vm.pc = pop();
        break;
      case "PUSH":
        push(src);
        break;
      case "POP":
        regs[a] = pop();
        break;
    }
  }

  return vm;
}
