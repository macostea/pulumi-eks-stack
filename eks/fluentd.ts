import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";

export function createFluentd(clusterName: string, cluster: eks.Cluster) {
    const fluentdCloudWatchLogGroup = new aws.cloudwatch.LogGroup(clusterName + "-fluentd-logs");
    const fluentdCloudwatch = new k8s.helm.v3.Chart("fluentd", {
        chart: "fluentd-cloudwatch",
        namespace: "kube-system",
        fetchOpts: {
            repo: "https://charts.helm.sh/incubator",
        },
        version: "0.11.0",
        values: {
            extraVars: [ "{ name: FLUENT_UID, value: '0' }" ],
            rbac: {create: true},
            awsRegion: aws.config.region,
            logGroupName: fluentdCloudWatchLogGroup.name,
        },
        transformations: [
            (obj: any) => {
                if (obj.metadata) {
                    obj.metadata.namespace = "kube-system";
                }
            }
        ]
    }, {
        providers: { kubernetes: cluster.provider },
    });

    return fluentdCloudWatchLogGroup;
}