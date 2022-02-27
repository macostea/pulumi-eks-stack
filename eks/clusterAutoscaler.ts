import * as fs from "fs";
import * as path from "path";
import * as eks from "@pulumi/eks"
import * as k8s from "@pulumi/kubernetes";

function updateAutoscalerYAML(yamlFilePath: string, outDirPath: string, clusterName: string, autoscalerRoleArn: string) {
    const data = fs.readFileSync(yamlFilePath, 'utf8');

    // TODO: This patching method has potential but at the moment the yaml file has been modified manually as well
    let result = data.replace(/<YOUR CLUSTER NAME>/g, clusterName);
    result = result.replace(/<CLUSTER AUTOSCALER ROLE>/g, autoscalerRoleArn);
    const autoscalerYAMLFilePath = path.join(outDirPath, "cluster-autoscaler-autodiscovery.yaml");

    fs.writeFileSync(autoscalerYAMLFilePath, result);

    return autoscalerYAMLFilePath;
}

function deployAutoscaler(autoscalerYAMLFilePath: string, cluster: eks.Cluster) {
    new k8s.yaml.ConfigFile("autoscaler", {
            file: autoscalerYAMLFilePath,
        },
        { provider: cluster.provider }
    );
}

export function createClusterAutoscaler(yamlFilePath: string, outDirPath: string, autoscalerRoleArn: string, cluster: eks.Cluster) {
    cluster.eksCluster.name.apply(clusterName => {
        const autoscalerYAMLFilePath = updateAutoscalerYAML(yamlFilePath, outDirPath, clusterName, autoscalerRoleArn);
        deployAutoscaler(autoscalerYAMLFilePath, cluster);
    });
}
