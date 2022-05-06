import core from '@actions/core'
import { Octokit } from '@octokit/rest'
import { createActionAuth } from '@octokit/auth-action'
import { execSync } from 'child_process'
import fs from 'fs'
import compareVersions from 'compare-versions';
import fetch from 'node-fetch';
import seriesMap from './series.js';
import { execHandler } from './util.js'
import { promisify } from 'util'
import { pipeline } from 'stream'

export async function main() {
    return new Promise(async (resolve, reject) => {
        try {
            const owner = core.getInput('owner')
            const repo = core.getInput('repo')
            const branch = core.getInput('branch')
            const series = core.getInput('series')
            const path = core.getInput('path')
            const actor = core.getInput('actor')
            const novaUsername = core.getInput('nova-username')
            const novaPassword = core.getInput('nova-password')

            const versionRange = seriesMap[series]

            const authentication = await (createActionAuth())();

            const octokit = new Octokit({
                auth: authentication.token,
            })

            const user = await octokit.rest.users.getAuthenticated()

            execSync(`git clone https://${actor}:${authentication.token}@github.com/${owner}/${repo}.git ${path}`)
            execSync(`git -C ${path} config user.email "${user.email}"`, execHandler)
            execSync(`git -C ${path} config user.name "${actor}"`, execHandler)

            let tags = await octokit.paginate('GET /repos/{owner}/{repo}/tags', {
                owner: owner,
                repo: repo,
            })

            tags = tags.sort((a, b) => compareVersions(a.name, b.name))
            let previousTag = tags.at(-1)?.name || null
            const nova = await (await fetch('https://nova.laravel.com/p2/laravel/nova.json')).json()
            const versionsToFetch = nova
                .packages['laravel/nova']
                .sort((a, b) => compareVersions(a.version, b.version))
                .filter(version => !tags.some((novaRelease) => version === novaRelease.version))

            for (const versionToFetch of versionsToFetch) {
                const satisfied = versionRange.some(range => compareVersions.satisfies(versionToFetch.version, range))

                if (!satisfied) {
                    continue
                }

                if (previousTag) {
                    execSync(`git -C ${path} checkout -q ${previousTag}`, execHandler)
                }
                execSync(`find ${path} -maxdepth 1 ! -wholename ${path}/.git ! -wholename ${path}/.github ! -wholename ${path} -exec rm -rf {} \\;`, execHandler)

                const streamPipeline = promisify(pipeline)

                const response = await fetch(versionToFetch.dist.url, {
                    headers: {
                        Authorization: "Basic " + btoa(novaUsername + ":" + novaPassword),
                    }
                })

                if (!response.ok) {
                    console.log("Response not ok: " + await response.text())
                    reject(await response.text())
                    return
                }

                const distPath = path + '/' + versionToFetch.version + '.zip'
                await streamPipeline(response.body, fs.createWriteStream(distPath))

                execSync(`unzip -oq ${distPath} -d ${path} -x .github`, execHandler)
                execSync(`rm ${distPath}`, execHandler)
                execSync(`git -C ${path} add .`, execHandler)
                execSync(`git -C ${path} commit -q -m "${versionToFetch.version}"`, execHandler)
                execSync(`git -C ${path} tag "${versionToFetch.version}"`, execHandler)
                execSync(`git -C ${path} push -q origin HEAD:${branch}`, execHandler)
                execSync(`git -C ${path} push -q --tags`, execHandler)

                previousTag = versionToFetch.version

                console.log("Version " + versionToFetch.version + " done")
            }

            resolve()
        } catch (error) {
            core.setFailed(error.message)
            reject(error.message)
        }
    })
}
