import * as fs from "fs";
import * as pulumi from "@pulumi/pulumi";
import { createCodePipeline } from "./codepipeline/codepipeline";
import { createEKSCluster } from "./eks/"


const config = new pulumi.Config();
const githubConnectionId = config.require("github-connection-id");
const outDirPath = config.require("out-dir");

if (fs.existsSync(outDirPath)) {
    fs.rmSync(outDirPath, { recursive: true });
}

fs.mkdirSync(outDirPath);

const codePipeline = createCodePipeline(githubConnectionId);
const eksCluster = createEKSCluster(outDirPath, "pulumi-eks-cluster");

export const pipeline = codePipeline.name;
export const kubeconfig = eksCluster.kubeconfig;
