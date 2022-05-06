import 'dotenv/config'
import { RunOptions, RunTarget } from 'github-action-ts-run-api'
import { main } from './index.js'
import { execSync } from 'child_process'
import assert from 'assert'
import { execHandler } from './util.js'

const path = '/tmp/nova'
execSync(`rm -rf ${path}`, execHandler)

const target = RunTarget.asyncFn(main)
const options = RunOptions.create()
    .setInputs({
        owner: 'MaloufSleep',
        repo: 'nova-clone-test',
        branch: 'master',
        series: 'Orion',
        actor: process.env.GITHUB_ACTOR,
        path,
        'nova-username': process.env.NOVA_USERNAME,
        'nova-password': process.env.NOVA_PASSWORD,
    })
    .setEnv({
        GITHUB_ACTION: true,
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    })

const result = await target.run(options)

assert(true)
