import fs from 'fs';
import path from 'path';

export function getFluidaAddress(): string {
  const filePath = path.join(__dirname, 'fluidaAddress.txt');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Address file not found at ${filePath}`);
  }
  const address = fs.readFileSync(filePath, 'utf8').trim();
  return address;
}
