#!/usr/bin/env node
import { Command } from 'commander';
import version from '../version.js';
import { addValidateCLI } from './validate.js';

const program = new Command();

addValidateCLI(program);

program.version(`v${version}`, '-v, --version', 'Print the current version of jats-xml');
program.option('-d, --debug', 'Log out any errors to the console.');
program.parse(process.argv);
