import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;

  const cusdt = await get("ConfidentialUSDT");

  const deployed = await deploy("ZKVault", {
    from: deployer,
    args: [cusdt.address],
    log: true,
  });

  console.log(`ZKVault: ${deployed.address} (cUSDT=${cusdt.address})`);
};

export default func;
func.id = "deploy_zkvault";
func.tags = ["ZKVault"];
func.dependencies = ["ConfidentialUSDT"];

