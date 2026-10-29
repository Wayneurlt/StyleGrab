-- CreateIndex
CREATE INDEX "Customer_name_trgm" ON "Customer" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_searchText_trgm" ON "Product" USING GIN ("searchText" gin_trgm_ops);
