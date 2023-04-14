#!/usr/bin/env node
import commander from 'commander';
import version from '../version';
import { addDownloadCLI } from './parse';
import { addValidateCLI } from './validate';

const program = new commander.Command();

addDownloadCLI(program);
addValidateCLI(program);

program.version(`v${version}`, '-v, --version', 'Print the current version of jats-xml');
program.option('-d, --debug', 'Log out any errors to the console.');
program.parse(process.argv);
