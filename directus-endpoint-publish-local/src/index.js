const config = require('./config.js');

const fs = require("fs");
const os = require("os");
const path = require("path");
const spawn = require('child_process').spawn;

module.exports = function registerEndpoint(router, { database }) {

    /**
     * Build
     */
    router.get('/build/:site', async function(req, res) {
        
        // Lookup Site Info from DB
        let site = await _getSiteInfo(req.params.site);
        if ( !site ) {
            return res.send({error: "Site configuration not found in Settings"});
        }

        // Make Temp File for Log
        let logFile = await _makeLogFile(site);
        if ( !logFile ) {
            return res.send({error: "Could not create log file"});
        }

        // Update Status
        let start_update_success = await _updateStatus(site, "Building");
        if ( !start_update_success ) {
            return res.send({error: "Could not update Site status to Building in Settings"});
        }

        // Run Build Command
        console.log("STARTING BUILD");
        let path = site[config.keys.path];
        let command = site[config.keys.command];
        console.log(path + " / " + command);
        console.log(logFile);
        let out = fs.openSync(logFile, 'a');
        let err = fs.openSync(logFile, 'a');
        spawn('npm', ['run', '--prefix ' + path, '"' + command + "'"], {
            stdio: [ 'ignore', out, err ],
            detached: true
        }).unref();

        res.send(site);
    });


    /**
     * Lookup Site info from DB (create object from key/value rows)
     * @param {int} site_id Site ID
     * @returns {Object} Site Info object
     */
    async function _getSiteInfo(site_id) {
        try {
            let rows = await database(config.collection.collection)
                .where('site', site_id)
                .select('key', 'value');
            let site = {};
            for (let row of rows) {
                site[row.key] = row.value;
            }
            return rows.length > 0 ? site : undefined;
        }
        catch (err) {
            console.log(err);
            return;
        }
    }

    /**
     * Update the Build Status and Timestamp in the Settings
     * @param {Site} site Site Info object
     * @param {String} status Site Build Status
     * @returns {Boolean} success
     */
    async function _updateStatus(site, status) {
        try {
            let status_count = await database(config.collection.collection)
                .update('value', status)
                .where('site', site[config.keys.id])
                .andWhere('key', config.keys.status);
            let timestamp_count = await database(config.collection.collection)
                .update('value', new Date().toLocaleString())
                .where('site', site[config.keys.id])
                .andWhere('key', config.keys.timestamp);
            return status_count === 1 && timestamp_count === 1;
        }
        catch (err) {
            console.log(err);
            return false;
        }
    }

    /**
     * Create a temp file for the build log
     * @param {Site} site Site Info object
     */
    async function _makeLogFile(site) {
        try {
            let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), config.extension + "-"));
            let logFile = path.join(tmpDir, "site-" + site[config.keys.id]);
            let count = await database(config.collection.collection)
                .update('value', logFile)
                .where('site', parseInt(site[config.keys.id]))
                .andWhere('key', config.keys.log);
            return count === 1 ? logFile : undefined;
        }
        catch (err) {
            console.log(err);
            return;
        }
    }

};