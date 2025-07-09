import { storage } from "../storage";
import { type InsertSicCode } from "@shared/schema";

export class SicCodeService {
  constructor() {
    this.initializeSicCodes();
  }

  private async initializeSicCodes() {
    const existingCodes = await storage.getSicCodes();
    
    if (existingCodes.length === 0) {
      await this.loadDefaultSicCodes();
    }
  }

  private async loadDefaultSicCodes() {
    const defaultSicCodes: InsertSicCode[] = [
      // Agriculture, Forestry, and Fishing (01-09)
      { code: "0111", description: "Wheat", division: "A", majorGroup: "01" },
      { code: "0112", description: "Rice", division: "A", majorGroup: "01" },
      
      // Mining (10-14)
      { code: "1011", description: "Iron Ores", division: "B", majorGroup: "10" },
      { code: "1021", description: "Copper Ores", division: "B", majorGroup: "10" },
      
      // Construction (15-17)
      { code: "1521", description: "General Contractors-Single-Family Houses", division: "C", majorGroup: "15" },
      { code: "1522", description: "General Contractors-Residential Buildings", division: "C", majorGroup: "15" },
      { code: "1531", description: "Operative Builders", division: "C", majorGroup: "15" },
      { code: "1541", description: "General Contractors-Industrial Buildings", division: "C", majorGroup: "15" },
      { code: "1542", description: "General Contractors-Nonresidential Buildings", division: "C", majorGroup: "15" },
      
      // Manufacturing (20-39)
      { code: "2011", description: "Meat Packing Plants", division: "D", majorGroup: "20" },
      { code: "2111", description: "Cigarettes", division: "D", majorGroup: "21" },
      
      // Transportation (40-49)
      { code: "4011", description: "Railroads, Line-Haul Operating", division: "E", majorGroup: "40" },
      { code: "4111", description: "Local & Suburban Transit", division: "E", majorGroup: "41" },
      
      // Wholesale Trade (50-51)
      { code: "5012", description: "Automobiles & Other Motor Vehicles", division: "F", majorGroup: "50" },
      { code: "5013", description: "Motor Vehicle Supplies & New Parts", division: "F", majorGroup: "50" },
      
      // Retail Trade (52-59)
      { code: "5211", description: "Lumber & Other Building Materials Dealers", division: "G", majorGroup: "52" },
      { code: "5311", description: "Department Stores", division: "G", majorGroup: "53" },
      { code: "5411", description: "Grocery Stores", division: "G", majorGroup: "54" },
      { code: "5812", description: "Eating Places", division: "G", majorGroup: "58" },
      
      // Finance, Insurance, and Real Estate (60-67)
      { code: "6011", description: "Federal Reserve Banks", division: "H", majorGroup: "60" },
      { code: "6021", description: "National Commercial Banks", division: "H", majorGroup: "60" },
      { code: "6111", description: "Federal & Federally Sponsored Credit Agencies", division: "H", majorGroup: "61" },
      { code: "6211", description: "Security Brokers, Dealers & Flotation Companies", division: "H", majorGroup: "62" },
      { code: "6311", description: "Life Insurance", division: "H", majorGroup: "63" },
      { code: "6411", description: "Insurance Agents, Brokers & Service", division: "H", majorGroup: "64" },
      { code: "6531", description: "Real Estate Agents & Managers", division: "H", majorGroup: "65" },
      
      // Services (70-89)
      { code: "7011", description: "Hotels & Motels", division: "I", majorGroup: "70" },
      { code: "7211", description: "Power Laundries, Family & Commercial", division: "I", majorGroup: "72" },
      { code: "7311", description: "Advertising Agencies", division: "I", majorGroup: "73" },
      { code: "7372", description: "Prepackaged Software", division: "I", majorGroup: "73" },
      { code: "7538", description: "General Automotive Repair Shops", division: "I", majorGroup: "75" },
      { code: "8011", description: "Offices & Clinics Of Doctors Of Medicine", division: "I", majorGroup: "80" },
      { code: "8021", description: "Offices & Clinics Of Dentists", division: "I", majorGroup: "80" },
      { code: "8111", description: "Legal Services", division: "I", majorGroup: "81" },
      { code: "8721", description: "Accounting, Auditing & Bookkeeping Services", division: "I", majorGroup: "87" },
      { code: "8999", description: "Services, NEC", division: "I", majorGroup: "89" },
      
      // Public Administration (91-97)
      { code: "9111", description: "Executive Offices", division: "J", majorGroup: "91" },
      { code: "9211", description: "Courts", division: "J", majorGroup: "92" },
      { code: "9311", description: "Public Finance, Taxation & Monetary Policy", division: "J", majorGroup: "93" },
      { code: "9411", description: "Administration Of Educational Programs", division: "J", majorGroup: "94" },
      { code: "9511", description: "Air & Water Resource & Solid Waste Management", division: "J", majorGroup: "95" },
      { code: "9611", description: "Administration Of General Economic Programs", division: "J", majorGroup: "96" },
      { code: "9711", description: "National Security", division: "J", majorGroup: "97" },
    ];

    for (const sicCode of defaultSicCodes) {
      try {
        await storage.createSicCode(sicCode);
      } catch (error) {
        // Ignore duplicate key errors
        if (!error.message.includes("duplicate key")) {
          console.error("Error creating SIC code:", error);
        }
      }
    }
  }

  async searchSicCodes(query: string): Promise<Array<{ code: string; description: string }>> {
    const sicCodes = await storage.getSicCodes();
    
    const results = sicCodes
      .filter(sic => 
        sic.description.toLowerCase().includes(query.toLowerCase()) ||
        sic.code.includes(query)
      )
      .map(sic => ({
        code: sic.code,
        description: sic.description
      }))
      .slice(0, 10); // Limit to top 10 results

    return results;
  }
}

export const sicCodeService = new SicCodeService();
