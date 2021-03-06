import * as fs from "fs";
import * as pulumi from "@pulumi/pulumi";
// import { createCodePipeline } from "./codepipeline/codepipeline";
import { createEKSCluster } from "./eks/";


const config = new pulumi.Config();

const outDirPath = config.require("out-dir");

if (fs.existsSync(outDirPath)) {
    fs.rmSync(outDirPath, { recursive: true });
}

fs.mkdirSync(outDirPath);

// Disable codepipeline for now as it does not work as expected.
// const githubConnectionId = config.require("github-connection-id");
// const codePipeline = createCodePipeline(githubConnectionId);
const eksClusterResult = createEKSCluster(outDirPath, "pulumi-eks-cluster");

// export const pipeline = codePipeline.name;
export const kubeconfig = eksClusterResult.cluster.kubeconfig;
export const restApiServiceAccount = eksClusterResult.restApiServiceAccount.metadata.name;
