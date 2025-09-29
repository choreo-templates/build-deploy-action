const axios = require('axios').default;
const core = require('@actions/core');
const fs = require('fs');
const yaml = require('js-yaml');

function getPreparedPath(path) {
    var seperatedPaths = path.split("/");
    seperatedPaths[seperatedPaths.length - 1] = seperatedPaths[seperatedPaths.length - 1].toLocaleLowerCase();
    return seperatedPaths.join("/");
}

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
    const containerId = core.getInput('container-id');
    const isContainerDeployment = core.getInput('is-container-deployment');
    const oasFilePath = core.getInput('oas-file-path');
    const gitHashDate = core.getInput('git-hash-date');
    const isAutoDeploy = core.getInput('is-auto-deploy') === 'true';
    const runId = core.getInput('run-id');

    const choreoApp = process.env.CHOREO_GITOPS_REPO;
    let cluster_image_tags = [];
    let preparedPortExtractFilePath = getPreparedPath(portExtractFilePath);
    if (!isContainerDeployment) {
        try {
            let fileContents = "";
            try {
                fileContents = fs.readFileSync(portExtractFilePath, 'utf8');
                preparedPortExtractFilePath = portExtractFilePath;
            } catch (error) {
                console.log("Checking other file format path: ", preparedPortExtractFilePath);
                fileContents = fs.readFileSync(preparedPortExtractFilePath, 'utf8');
            }
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
    }

    try {
        const fileContents = fs.readFileSync(`/home/runner/workspace/${choreoApp}/${process.env.REG_CRED_FILE_NAME}`, 'utf8');
        let data = JSON.parse(fileContents);
        for (const cred of data) {
            // We add docker hub docker login to increase the image pull rate limit and this registry id is added as a choreo-docker-hub
            // so we skip the docker push for this registry
            if (cred.registry_id == "choreo-docker-hub") {
                continue;
            }
            if (cred.type == "GCP") {
                const registryPassword = cred.credentials.registryPassword;
                const keyContex = Buffer.from(registryPassword, 'base64').toString();
                const region = cred.credentials.region;
                const repository = cred.credentials.repository;
                const projectId = JSON.parse(keyContex)['project_id'];
                cluster_image_tags.push({
                    registry_id: cred.registry_id,
                    clusters: cred.clusters,
                    image_name_with_tag: `${region}-docker.pkg.dev/${projectId}/${repository}/${choreoApp}:${process.env.NEW_SHA}`
                });
                continue;
            }
            cluster_image_tags.push({
                registry_id: cred.registry_id,
                clusters: cred.clusters,
                image_name_with_tag: `${cred.credentials.registry}/${choreoApp}:${process.env.NEW_SHA}`
            });
        }
    } catch (error) {
        console.log(`Failed to load ${process.env.REG_CRED_FILE_NAME} file: `, error);
    }

    console.log(`Sending Request to Choreo API....`);
    const body = isContainerDeployment ? {
        image: imageName,
        tag: gitHash,
        git_hash: gitHash,
        gitops_hash: gitOpsHash,
        app_id: appId,
        api_version_id: api_version_id,
        environment_id: envId,
        registry_token: token,
        container_id: containerId,
        api_definition_path: oasFilePath,
        cluster_image_tags,
        git_hash_commit_timestamp: gitHashDate,
        is_auto_deploy: isAutoDeploy,
        run_id: runId
    } : {
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
        workspace_yaml_path: preparedPortExtractFilePath,
        cluster_image_tags,
        git_hash_commit_timestamp: gitHashDate,
        is_auto_deploy: isAutoDeploy,
        run_id: runId
    };

    let WebhhookURL;
    if (body.registry_token && body.registry_token != "") {
        WebhhookURL = isContainerDeployment ? `${domain}/image/deploy-byoc` : `${domain}/image/deploy`;
    }
    if (debug) {
        console.log("request-body: ", JSON.stringify(body));
    }

    axios.post(WebhhookURL, body).then(function (response) {
        core.debug("choreo-status", "deployed");
        console.log("choreo-status", "deployed");
    }).catch(function (error) {
        if (error.response) {
            core.setFailed(error.response.data);
            console.log(error.response.status);
        } else if (error.request) {
            console.log(error.request);
        } else {
            console.log('Error', error.message);
            core.debug("choreo-status", "failed");
            core.setFailed(error.message);
        }
    });

} catch (error) {
    core.debug("choreo-status", "failed");
    core.setFailed(error.message);
    console.log("choreo-status", "failed");
    console.log(error.message);
}


