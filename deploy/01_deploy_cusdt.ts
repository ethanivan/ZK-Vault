import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployed = await deploy("ConfidentialUSDT", {
    from: deployer,
    log: true,
  });

  console.log(`ConfidentialUSDT (cUSDT): ${deployed.address}`);
};

export default func;
func.id = "deploy_cusdt";
func.tags = ["ConfidentialUSDT", "cUSDT"];

