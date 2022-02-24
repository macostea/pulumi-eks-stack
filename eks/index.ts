import * as path from "path";
import * as eks from "@pulumi/eks";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { createEKSIAMRoles, EKSIAMRolesResult, createClusterAutoscalerRole } from "./iam";
import { createNodeGroups } from "./workers";
import { createClusterAutoscaler } from "./clusterAutoscaler";
import { createFluentBit } from "./fluent-bit";
import { createAlbIngressController } from "./albIngressController";


function createCluster(clusterName: string, roles: EKSIAMRolesResult) {
    const cluster = new eks.Cluster(clusterName, {
        version: "1.21",
        roleMappings: [
            {
                roleArn: roles.admins.arn,
                groups: ["system:masters"],
                username: "admin",
            },
            // Also created a devs role but it's not mapped here yet for simplicity.
        ],
        instanceRoles: [
            roles.admins,
            roles.devs,
            roles.stdNodegroup,
            roles.perfNodegroup
        ],
        skipDefaultNodeGroup: true,
        enabledClusterLogTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"],
        createOidcProvider: true
    });

    new k8s.rbac.v1.ClusterRole("clusterAdminRole", {
        metadata: {
            name: "clusterAdminRole",
        },
        rules: [{
            apiGroups: [""],
            resources: ["*"],
            verbs: ["*"],
        }],
    }, { provider: cluster.provider });

    new k8s.rbac.v1.ClusterRoleBinding("clusterAdminBinding", {
        metadata: {
          name: "clusterAdminBinding",
        },
        subjects: [{ 
           kind: "User",
           name: "admin",
        }], 
        roleRef: {
          kind: "ClusterRole",
          name: "clusterAdminRole",
          apiGroup: "rbac.authorization.k8s.io",
        },
      }, {provider: cluster.provider});

    return cluster;
}

function createSampleApplication(cluster: eks.Cluster) {
    const nsgame  = new k8s.core.v1.Namespace(
        "2048-game",
        { metadata: { name: "2048-game" } },
        { provider: cluster.provider }
      );

    const deploymentgame = new k8s.extensions.v1beta1.Deployment(
        "deployment-game",
        {
          metadata: { name: "deployment-game", namespace: "2048-game" },
          spec: {
            replicas: 5,
            template: {
              metadata: { labels: { app: "2048" } },
              spec: {
                containers: [
                  {
                    image: "alexwhen/docker-2048",
                    imagePullPolicy: "Always",
                    name: "2048",
                    ports: [{ containerPort: 80 }]
                  }
                ]
              }
            }
          }
        },
        { provider: cluster.provider }
      );
    
    const servicegame = new k8s.core.v1.Service(
        "service-game",
        {
          metadata: { name: "service-2048", namespace: "2048-game" },
          spec: {
            ports: [{ port: 80, targetPort: 80, protocol: "TCP" }],
            type: "NodePort",
            selector: { app: "2048" }
          }
        },
        { provider: cluster.provider }
      );

    const ingressgame = new k8s.extensions.v1beta1.Ingress(
        "ingress-game",
        {
          metadata: {
            name: "2048-ingress",
            namespace: "2048-game",
            annotations: {
              "kubernetes.io/ingress.class": "alb",
              "alb.ingress.kubernetes.io/scheme": "internet-facing"
            },
            labels: { app: "2048-ingress" }
          },
          spec: {
            rules: [
              {
                http: {
                  paths: [
                    {
                      path: "/*",
                      backend: { serviceName: "service-2048", servicePort: 80 }
                    }
                  ]
                }
              }
            ]
          }
        },
        { provider: cluster.provider }
      );
}

export function createEKSCluster(outDirPath: string, clusterName: string) {
    const roles = createEKSIAMRoles();
    const cluster = createCluster(clusterName, roles);
    const nodeGroups = createNodeGroups(cluster, roles);
    const fluentdCloudwatch = createFluentBit(clusterName, cluster);
    const albIngressController = createAlbIngressController(clusterName, cluster, roles.albIngressControllerRole);
    const autoscalerRole = createClusterAutoscalerRole(cluster);
    autoscalerRole.arn.apply(autoscalerRoleArn => {
        createClusterAutoscaler(path.join(__dirname, "cluster-autoscaler-autodiscover.yaml"), outDirPath, autoscalerRoleArn, cluster);
    });

    return cluster;
};
