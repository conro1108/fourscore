/**
 * SRC\maze.c, SRC\tetris.c, SRC\c4.c — three more programs for the
 * machine's own processor, kept here rather than in copy.ts for the same
 * reason llm.c is: they are pages of another language and copy.ts is prose.
 * `String.raw` so the C's backslashes stay the C's. cc.test.ts compiles and
 * runs each on the real CPU so c.txt's "known to work" stays true.
 *
 * Things the dialect taught, worth knowing before writing the next one:
 * an array's size must be a literal; a #define line takes nothing but the
 * name and the number; and a word is signed, so rand() % n goes negative
 * half the time — mask to 15 bits first.
 */

export const MAZE_C = String.raw`/* maze.c — a maze, carved while you watch, then walked.
   cd /src; cc maze.c; run maze. WASD walk. Reach the * at the bottom
   right. ESC leaves, always. */

#define W 39
#define H 23
int cell[897];       /* W * H; 0 wall, 1 open */
int st[220];         /* the carver's trail, as cells */
int px;  int py;

void draw(int x, int y, int c) {
    vpos(y * 40 + x);
    vput(c);
}

void text(int x, int y, char *s) {
    vpos(y * 40 + x);
    while (*s) { vput(*s); s++; }
}

void open(int x, int y) {
    cell[y * W + x] = 1;
    draw(x, y, ' ');
}

/* the cell two steps from (x, y) in direction d, if it is still wall */
int step(int x, int y, int d, int *out) {
    int nx;  int ny;
    nx = x;  ny = y;
    if (d == 0) ny = y - 2;
    if (d == 1) nx = x + 2;
    if (d == 2) ny = y + 2;
    if (d == 3) nx = x - 2;
    if (nx < 1 || nx >= W - 1 || ny < 1 || ny >= H - 1) return 0;
    if (cell[ny * W + nx]) return 0;
    out[0] = nx;  out[1] = ny;
    return 1;
}

int nxt[2];

/* a depth-first walk with a random hand, on an explicit stack */
void carve() {
    int sp;  int x;  int y;  int d;  int i;  int went;
    st[0] = 1 * W + 1;
    open(1, 1);
    sp = 1;
    while (sp > 0) {
        x = st[sp - 1] % W;
        y = st[sp - 1] / W;
        went = 0;
        d = rand() & 3;
        for (i = 0; i < 4 && !went; i++) {
            if (step(x, y, (d + i) & 3, nxt)) {
                open((x + nxt[0]) / 2, (y + nxt[1]) / 2);
                open(nxt[0], nxt[1]);
                st[sp] = nxt[1] * W + nxt[0];
                sp++;
                went = 1;
            }
        }
        if (!went) sp--;
        if ((sp & 1) == 0) vsync();
    }
}

void walk(int dx, int dy) {
    int nx;  int ny;
    nx = px + dx;  ny = py + dy;
    if (!cell[ny * W + nx]) return;
    draw(px, py, ' ');
    px = nx;  py = ny;
    draw(px, py, '@');
}

int main() {
    int x;  int y;  int k;
    for (y = 0; y < H; y++)
        for (x = 0; x < W; x++) draw(x, y, '#');
    carve();
    draw(W - 2, H - 2, '*');
    px = 1;  py = 1;
    draw(px, py, '@');
    text(0, 23, "WASD. FIND THE *.");
    while (px != W - 2 || py != H - 2) {
        vsync();
        k = key();
        if (k == 'w' || k == 'W') walk(0, -1);
        if (k == 's' || k == 'S') walk(0, 1);
        if (k == 'a' || k == 'A') walk(-1, 0);
        if (k == 'd' || k == 'D') walk(1, 0);
    }
    text(0, 23, "YOU ARE OUT. IT IS NO BETTER OUT HERE.  ");
    while (key()) ;
    while (!key()) vsync();
    return 0;
}
`;

export const TETRIS_C = String.raw`/* tetris.c — the falling blocks, on this machine's own screen.
   cd /src; cc tetris.c; run tetris. A and D move, W turns, S hurries,
   SPACE drops. It gets faster. ESC leaves, always. */

#define BW 10
#define BH 20
#define OX 15
#define OY 2
/* OX, OY: where the well sits on the screen */
/* OX, OY: where the well sits on the screen */
int bd[200];             /* BW * BH; 0 empty, else a piece number */
/* seven pieces, four turns each, as 4x4 bitmaps: bit 15 is the top left */
int shape[] = {
    0x0F00, 0x2222, 0x00F0, 0x4444,
    0x44C0, 0x8E00, 0x6440, 0x0E20,
    0x4460, 0x0E80, 0xC440, 0x2E00,
    0xCC00, 0xCC00, 0xCC00, 0xCC00,
    0x06C0, 0x8C40, 0x6C00, 0x4620,
    0x0E40, 0x4C40, 0x4E00, 0x4640,
    0x0C60, 0x4C80, 0xC600, 0x8C40
};
int piece;  int rot;  int px;  int py;
int lines = 0;  int score = 0;

void draw(int x, int y, int c) {
    vpos(y * 40 + x);
    vput(c);
}

void text(int x, int y, char *s) {
    vpos(y * 40 + x);
    while (*s) { vput(*s); s++; }
}

void number(int x, int y, int n) {
    int d;  int i;
    d = 10000;
    for (i = 0; i < 5; i++) {
        draw(x + i, y, '0' + (n / d) % 10);
        d = d / 10;
    }
}

int bit(int m, int r, int c) {
    return m & (0x8000 >> (r * 4 + c));
}

/* could the piece sit at (x, y) turned t ways? */
int fits(int x, int y, int t) {
    int m;  int r;  int c;
    m = shape[piece * 4 + t];
    for (r = 0; r < 4; r++)
        for (c = 0; c < 4; c++)
            if (bit(m, r, c)) {
                if (x + c < 0 || x + c >= BW || y + r >= BH) return 0;
                if (y + r >= 0 && bd[(y + r) * BW + x + c]) return 0;
            }
    return 1;
}

void paint(int ch) {
    int m;  int r;  int c;
    m = shape[piece * 4 + rot];
    for (r = 0; r < 4; r++)
        for (c = 0; c < 4; c++)
            if (bit(m, r, c) && py + r >= 0) draw(OX + px + c, OY + py + r, ch);
}

void well() {
    int x;  int y;
    for (y = 0; y < BH; y++) {
        draw(OX - 1, OY + y, '|');
        draw(OX + BW, OY + y, '|');
        for (x = 0; x < BW; x++) draw(OX + x, OY + y, bd[y * BW + x] ? '#' : ' ');
    }
    for (x = -1; x <= BW; x++) draw(OX + x, OY + BH, '=');
    text(28, 4, "LINES");
    number(28, 5, lines);
    text(28, 7, "SCORE");
    number(28, 8, score);
}

/* the piece becomes floor; full rows leave */
void lock() {
    int m;  int r;  int c;  int y;  int x;  int full;  int got;
    m = shape[piece * 4 + rot];
    for (r = 0; r < 4; r++)
        for (c = 0; c < 4; c++)
            if (bit(m, r, c) && py + r >= 0) bd[(py + r) * BW + px + c] = piece + 1;
    got = 0;
    for (y = BH - 1; y >= 0; y--) {
        full = 1;
        for (x = 0; x < BW; x++) if (!bd[y * BW + x]) full = 0;
        if (full) {
            got++;
            for (r = y; r > 0; r--)
                for (x = 0; x < BW; x++) bd[r * BW + x] = bd[(r - 1) * BW + x];
            for (x = 0; x < BW; x++) bd[x] = 0;
            y++;      /* the row above has moved down into this one */
        }
    }
    lines = lines + got;
    score = score + got * got * 100;
    well();
}

int spawn() {
    piece = (rand() & 0x7FFF) % 7;   /* a word is signed; keep it positive */
    rot = 0;  px = 3;  py = -1;
    return fits(px, py, rot);
}

void shift(int dx, int dy, int dt) {
    int nt;
    nt = (rot + dt) & 3;
    if (!fits(px + dx, py + dy, nt)) return;
    paint(' ');
    px = px + dx;  py = py + dy;  rot = nt;
    paint('O');
}

int main() {
    int k;  int t;  int gap;  int alive;
    well();
    text(28, 12, "A D  MOVE");
    text(28, 13, "W    TURN");
    text(28, 14, "S    HURRY");
    text(28, 15, "SPACE DROP");
    alive = spawn();
    paint('O');
    t = 0;
    while (alive) {
        vsync();
        k = key();
        while (k) {
            if (k == 'a' || k == 'A') shift(-1, 0, 0);
            if (k == 'd' || k == 'D') shift(1, 0, 0);
            if (k == 'w' || k == 'W') shift(0, 0, 1);
            if (k == 's' || k == 'S') shift(0, 1, 0);
            if (k == ' ') { while (fits(px, py + 1, rot)) shift(0, 1, 0); t = 1000; }
            k = key();
        }
        gap = 30 - lines;
        if (gap < 4) gap = 4;
        t++;
        if (t < gap) continue;
        t = 0;
        if (fits(px, py + 1, rot)) { shift(0, 1, 0); continue; }
        lock();
        alive = spawn();
        paint('O');
    }
    text(OX - 1, OY + 9, "  THE WELL  ");
    text(OX - 1, OY + 10, "  IS FULL.  ");
    while (key()) ;
    while (!key()) vsync();
    return 0;
}
`;

export const C4_C = String.raw`/* c4.c — the game this whole machine is named for, on its own processor.
   cd /src; cc c4.c; run c4. Press 1 to 7 to drop. You are O and you go
   first. The machine looks three moves ahead, which takes it a moment,
   because it is doing it on this. ESC leaves, always. */

#define DEPTH 3
int b[42];               /* 0 empty, 1 you, 2 it; row 0 is the bottom */
int h[7];                /* how full each column is */
int last = 0;

void draw(int x, int y, int c) {
    vpos(y * 40 + x);
    vput(c);
}

void text(int x, int y, char *s) {
    vpos(y * 40 + x);
    while (*s) { vput(*s); s++; }
}

void cell(int c, int r) {
    int v;  int ch;
    v = b[r * 7 + c];
    ch = '.';
    if (v == 1) ch = 'O';
    if (v == 2) ch = 'X';
    draw(12 + c * 4, 15 - r * 2, ch);
}

void board() {
    int c;  int r;
    for (r = 0; r < 6; r++)
        for (c = 0; c < 7; c++) cell(c, r);
    for (c = 0; c < 7; c++) draw(12 + c * 4, 17, '1' + c);
}

/* count the run through (c, r) along (dc, dr), both ways */
int run(int c, int r, int dc, int dr, int who) {
    int n;  int x;  int y;
    n = 1;
    x = c + dc;  y = r + dr;
    while (x >= 0 && x < 7 && y >= 0 && y < 6 && b[y * 7 + x] == who) { n++; x = x + dc; y = y + dr; }
    x = c - dc;  y = r - dr;
    while (x >= 0 && x < 7 && y >= 0 && y < 6 && b[y * 7 + x] == who) { n++; x = x - dc; y = y - dr; }
    return n;
}

int wins(int c, int r, int who) {
    if (run(c, r, 1, 0, who) >= 4) return 1;
    if (run(c, r, 0, 1, who) >= 4) return 1;
    if (run(c, r, 1, 1, who) >= 4) return 1;
    if (run(c, r, 1, -1, who) >= 4) return 1;
    return 0;
}

int drop(int c, int who) {
    int r;
    r = h[c];
    b[r * 7 + c] = who;
    h[c]++;
    return r;
}

void lift(int c) {
    h[c]--;
    b[h[c] * 7 + c] = 0;
}

/* how good the position is for who, who is about to move */
int search(int who, int depth) {
    int c;  int r;  int best;  int s;
    best = -9999;
    for (c = 0; c < 7; c++) {
        if (h[c] == 6) continue;
        r = drop(c, who);
        if (wins(c, r, who)) s = 1000 + depth;
        else if (depth == 0) s = 3 - (c > 3 ? c - 3 : 3 - c);
        else s = -search(3 - who, depth - 1);
        lift(c);
        if (s > best) best = s;
    }
    if (best == -9999) return 0;   /* nowhere to go: a draw */
    return best;
}

int machine() {
    int c;  int r;  int s;  int best;  int pick;
    best = -9999;  pick = 3;
    for (c = 0; c < 7; c++) {
        if (h[c] == 6) continue;
        r = drop(c, 2);
        if (wins(c, r, 2)) s = 2000;
        else s = -search(1, DEPTH - 1);
        lift(c);
        s = s * 4 + (rand() & 3);    /* between equals, it has moods */
        if (s > best) { best = s; pick = c; }
    }
    return pick;
}

int main() {
    int k;  int c;  int r;  int turn;  int moves;
    board();
    text(6, 20, "YOU ARE O. PRESS A NUMBER.");
    turn = 1;  moves = 0;
    while (moves < 42) {
        if (turn == 1) {
            k = 0;
            while (k < '1' || k > '7' || h[k - '1'] == 6) { vsync(); k = key(); }
            c = k - '1';
        } else {
            text(6, 20, "THE MACHINE IS THINKING.  ");
            c = machine();
            text(6, 20, "YOUR MOVE.                ");
        }
        r = drop(c, turn);
        cell(c, r);
        moves++;
        if (wins(c, r, turn)) break;
        turn = 3 - turn;
    }
    if (moves == 42) text(6, 20, "NOBODY. THE BOARD IS FULL.");
    else if (turn == 1) text(6, 20, "FOUR. YOU HAVE BEATEN A 486. ");
    else text(6, 20, "FOUR. THE MACHINE THANKS YOU.");
    text(14, 22, "ANY KEY.");
    while (key()) ;
    while (!key()) vsync();
    return 0;
}
`;

