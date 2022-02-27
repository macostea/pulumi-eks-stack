# EKS Cluster with Pulumi

## What's included
* EKS Cluster ([/eks](/eks)):
  * 2 Managed Node Groups (standard and performance) with different templates ([/eks/workers.ts](/eks/workers.ts))
  * IAM Roles and policies for 2 groups of users (admins and devs) ([/eks/iam.ts](/eks/iam.ts))
  * IAM Roles and policies for node groups ([/eks/iam.ts](/eks/iam.ts))
  * FluentBit for publishing cluster and container logs to CloudWatch ([/eks/fluentBit.ts](/eks/fluentBit.ts))
  * ClusterAutoscaler for scaling up/down based on node usage ([/eks/clusterAutoscaler.ts](/eks/clusterAutoscaler.ts))
  * ALB Ingress Controller for exposing deployed services to the internet using ALB([/eks/albIngressController.ts](/eks/albIngressController.ts))
  * Service account for REST API that allows access to DynamoDB ([/eks/iam.ts](/eks/iam.ts))
