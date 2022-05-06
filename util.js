export function execHandler(error, stdout, stderr) {
    console.log("in")
    if (error) {
        throw stderr
    }
}

export default {
    execHandler,
}
