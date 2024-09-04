import { Command } from 'commander';
import { jatsToMyst } from '../index.js';

function makeConvertCLI(program: Command) {
  const command = new Command('convert')
    .description('Convert JATS file to MyST mdast json')
    .argument('<input>', 'The JATS file')
    // .argument('<output>', 'The mdast.json output file')
    .action(jatsToMyst);
  return command;
}

export function addConvertCLI(program: Command) {
  program.addCommand(makeConvertCLI(program));
}
