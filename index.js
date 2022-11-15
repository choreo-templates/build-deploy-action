const axios = require('axios').default;
const core = require('@actions/core');
// const github = require('@actions/github');
const fs = require('fs');
const yaml = require('js-yaml');

try {
    const extractedPorts = [];
    const domain = core.getInput('domain');
    const organizationId = core.getInput('org-id');
    const projectId = core.getInput('project-id');
    const appId = core.getInput('app-id');
    const envId = core.getInput('env-id');
    const api_version_id = core.getInput('version');
    const imageName = core.getInput('image-name');
    const gitHash = core.getInput('git-hash');
    const gitOpsHash = core.getInput('gitops-hash');
    const token = core.getInput('token');
    const debug = core.getInput('debug');
    const isHttpBased = core.getInput('is-http-based');
    const portExtractFilePath = core.getInput('port-extract-file-path');

    const choreoApp = process.env.CHOREO_APP;
    let cluster_image_tags = [];
    try {
        let fileContents = fs.readFileSync(portExtractFilePath, 'utf8');
        let data = yaml.loadAll(fileContents);

        for (const file of data) {
            if (file.kind == 'Service') {
                for (const port of file.spec.ports) {
                    extractedPorts.push({
                        port: port.port,
                        name: port.name
                    });
                }
            }
        }
        if (extractedPorts.length === 0 && isHttpBased) {
            extractedPorts.push({
                port: 8090,
                name: "port-1-default"
            });
        }
    } catch (e) {
        console.log(e);
    }

    try {
        const fileContents = fs.readFileSync(`/home/runner/workspace/${choreoApp}/deployment-data.json`, 'utf8');
        let data = JSON.parse(fileContents);
        for (const cred of data) {
            cred['imageNameWithTag'] = `${cred['imageNameWithTag']}/${choreoApp}:${gitHash}`
        }
        cluster_image_tags = data;
    } catch (error) {
        console.log("Failed to load deployment-data.json file: ", e);
    }

    console.log(`Sending Request to Choreo API....`);
    const body = {
        image: imageName,
        tag: gitHash,
        image_ports: extractedPorts,
        git_hash: gitHash,
        gitops_hash: gitOpsHash,
        organization_id: organizationId,
        project_id: projectId,
        app_id: appId,
        api_version_id: api_version_id,
        environment_id: envId,
        registry_token: token,
        workspace_yaml_path: portExtractFilePath,
        cluster_image_tags
    }

    let WebhhookURL;
    if (body.registry_token && body.registry_token != "") {
        WebhhookURL = `${domain}/image/deploy`
    }
    if (debug) {
        console.log("request-body: ", JSON.stringify(body));
    }

    axios.post(WebhhookURL, body).then(function (response) {
        core.info("choreo-status", "deployed");
        console.log("choreo-status", "deployed");
    }).catch(function (error) {
        if (error.response) {
            core.setFailed(error.response.data);
            console.log(error.response.status);
        } else if (error.request) {
            console.log(error.request);
        } else {
            console.log('Error', error.message);
            core.info("choreo-status", "failed");
            core.setFailed(error.message);
        }
    });

} catch (error) {
    core.info("choreo-status", "failed");
    core.setFailed(error.message);
    console.log("choreo-status", "failed");
    console.log(error.message);
}



