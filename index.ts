import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

import { createCodePipeline } from "./codepipeline/codepipeline";
import { createEKSCluster } from "./eks/"

const config = new pulumi.Config();
const githubConnectionId = config.require("github-connection-id");

const codePipeline = createCodePipeline(githubConnectionId);
const eksCluster = createEKSCluster("pulumi-eks-cluster");

export const pipeline = codePipeline.name;
export const kubeconfig = eksCluster.kubeconfig;
