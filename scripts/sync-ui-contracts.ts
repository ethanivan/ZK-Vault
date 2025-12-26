import * as fs from "fs";
import * as path from "path";

type Deployment = {
  address: string;
  abi: unknown;
};

function readDeployment(network: string, contractName: string): Deployment {
  const filePath = path.join(__dirname, "..", "deployments", network, `${contractName}.json`);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as Deployment;
  if (!parsed?.address || !parsed?.abi) {
    throw new Error(`Invalid deployment file: ${filePath}`);
  }
  return parsed;
}

function main() {
  const network = "sepolia";

  const cusdt = readDeployment(network, "ConfidentialUSDT");
  const vault = readDeployment(network, "ZKVault");

  const outPath = path.join(__dirname, "..", "ui", "src", "config", "contracts.ts");

  const content = `export const SEPOLIA_CHAIN_ID = 11155111;

export const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export const DEFAULT_CUSDT_ADDRESS = '${cusdt.address}' as const;
export const DEFAULT_VAULT_ADDRESS = '${vault.address}' as const;

export const CUSDT_ABI = ${JSON.stringify(cusdt.abi, null, 2)} as const;

export const ZKVAULT_ABI = ${JSON.stringify(vault.abi, null, 2)} as const;
`;

  fs.writeFileSync(outPath, content, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`cUSDT : ${cusdt.address}`);
  console.log(`Vault : ${vault.address}`);
}

main();

