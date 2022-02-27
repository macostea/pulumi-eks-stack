import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";

export function createFluentBit(clusterName: string, cluster: eks.Cluster) {
    new k8s.yaml.ConfigFile("amazon-cloudwatch-namespace", {
        file: "https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/cloudwatch-namespace.yaml"
    }, {
        provider: cluster.provider
    });

    if (!aws.config.region) {
        throw new Error("aws.config.region is not set");
    }

    const awsRegion = aws.config.region;
    
    new k8s.core.v1.ConfigMap("fluent-bit-config-map", {
        metadata: {
            namespace: "amazon-cloudwatch",
            name: "fluent-bit-cluster-info"
        },
        data: {
            "cluster.name": clusterName,
            "http.server": "On",
            "http.port": "2020",
            "logs.region": awsRegion,
            "read.head": "Off",
            "read.tail": "On",
        }
    }, {
        provider: cluster.provider 
    });

    const fluentBitDaemonSet = new k8s.yaml.ConfigFile("amazon-cloudwatch-fluent-bit-daemon-set", {
        file: "https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/fluent-bit/fluent-bit.yaml"
    }, {
        provider: cluster.provider
    });

    return fluentBitDaemonSet;
}