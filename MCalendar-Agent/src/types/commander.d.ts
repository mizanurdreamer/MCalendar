declare module 'commander' {
  export class Command {
    constructor(name?: string);
    name(name: string): this;
    version(version: string, flags?: string, description?: string): this;
    description(description: string): this;
    argument(name: string, description?: string): this;
    option(flags: string, description: string, defaultValue?: any): this;
    action(handler: (...args: any[]) => Promise<void> | void): this;
    parse(argv?: string[]): this;
    parseAsync(argv?: string[]): Promise<this>;
    help(cb?: (str: string) => void): this;
    outputHelp(cb?: (str: string) => void): this;
    helpInformation(): string;
    addHelpText(section: string, text: string): this;
    command(name: string, description?: string, opts?: { isDefault?: boolean }): this;
    addCommand(cmd: Command): this;
    addHelpCommand(enableOrNameAndArgs?: string | boolean, description?: string): this;
  }
}