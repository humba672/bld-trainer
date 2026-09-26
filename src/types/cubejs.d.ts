declare module 'cubejs' {
  export default class Cube {
    /** Build the two-phase solver tables. Takes a second or so, once. */
    static initSolver(): void;
    /** A random-state scramble: a random cube, solved, and the solution inverted. */
    static scramble(): string;
    static random(): Cube;
    static inverse(alg: string): string;
    move(alg: string): void;
    solve(maxDepth?: number): string;
    isSolved(): boolean;
    asString(): string;
  }
}
