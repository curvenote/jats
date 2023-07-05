import { Command, Option } from 'commander';
import { clirun } from 'myst-cli-utils';
import { getSession } from 'jats-xml';
import { validateMecaWrapper } from '../validate/index.js';

function makeValidateCLI(program: Command) {
  const command = new Command('validate')
    .description(
      `
      Validate MECA file against zip structure and DTD schemas.

      The zip file must have a 'manifest.xml' file which must pass Manifest DTD validation.
      All the files in the manifest must exist in the zip file, with no others present.
      Any JATS files must validate against JATS DTD schema.
      `,
    )
    .argument('<file>', 'MECA file to validate')
    .addOption(
      new Option(
        '--library <value>',
        'JATS library - archiving, publishing, or authoring (default: archiving, if value cannot be inferred from file)',
      ),
    )
    .addOption(
      new Option(
        '--jats <version>',
        'JATS version, must be 1.1 or later (default: 1.3, if value cannot be inferred from file)',
      ),
    )
    .addOption(
      new Option(
        '--mathml <version>',
        'MathML version, 2 or 3 (default: 3, if value cannot be inferred from file)',
      ),
    )
    .addOption(
      new Option(
        '--oasis',
        'Use OASIS table model (default: false, if value cannot be inferred from file)',
      ),
    )
    .addOption(new Option('--directory <value>', 'Directory to save JATS DTD file'))
    .action(clirun(validateMecaWrapper, { program, getSession }));
  return command;
}

export function addValidateCLI(program: Command) {
  program.addCommand(makeValidateCLI(program));
}
