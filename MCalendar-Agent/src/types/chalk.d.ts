declare module 'chalk' {
  export interface Chalk {
    (text: string): string;
    reset: Chalk;
    bold: Chalk;
    dim: Chalk;
    italic: Chalk;
    underline: Chalk;
    strikethrough: Chalk;
    red: Chalk;
    green: Chalk;
    yellow: Chalk;
    blue: Chalk;
    magenta: Chalk;
    cyan: Chalk;
    white: Chalk;
    gray: Chalk;
    black: Chalk;
    redBright: Chalk;
    greenBright: Chalk;
    yellowBright: Chalk;
    blueBright: Chalk;
    magentaBright: Chalk;
    cyanBright: Chalk;
    whiteBright: Chalk;
  }
  
  const chalk: Chalk;
  export default chalk;
}