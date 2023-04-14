import { Command, Option } from 'commander';
import { clirun } from 'myst-cli-utils';
import { getSession } from '../session';
import { validateJatsAgainstDtdWrapper } from '../validate';

function makeValidateCLI(program: Command) {
  const command = new Command('validate')
    .description('Fetch JATS DTD schema file from nih.gov ftp server')
    .argument('<file>', 'JATS file to validate')
    .addOption(new Option('--jats <version>', 'JATS version, must be 1.2 or later').default('1.3'))
    .addOption(new Option('--mathml <version>', 'MathML version, 2 or 3').default('3'))
    .addOption(new Option('--oasis', 'Use OASIS table model').default(false))
    .addOption(new Option('--directory <value>', 'Directory to save DTD file'))
    .action(clirun(validateJatsAgainstDtdWrapper, { program, getSession }));
  return command;
}

export function addValidateCLI(program: Command) {
  program.addCommand(makeValidateCLI(program));
}
