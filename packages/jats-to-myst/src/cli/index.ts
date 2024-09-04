#!/usr/bin/env node
import { Command } from 'commander';
import version from '../version.js';
import { addConvertCLI } from './convert.js';

const program = new Command();

addConvertCLI(program);

program.version(`v${version}`, '-v, --version', 'Print the current version of jats-to-myst');
program.option('-d, --debug', 'Log out any errors to the console.');
program.parse(process.argv);
