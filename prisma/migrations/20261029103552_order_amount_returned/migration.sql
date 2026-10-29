-- DropIndex
DROP INDEX "Customer_name_trgm";

-- DropIndex
DROP INDEX "Product_searchText_trgm";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "amountReturned" INTEGER NOT NULL DEFAULT 0;
