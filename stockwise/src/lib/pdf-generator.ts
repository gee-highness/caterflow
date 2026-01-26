import PDFDocument from 'pdfkit';

export async function generatePurchaseOrderPDF(purchaseOrder: any, includePrices: boolean = false): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const buffers: Buffer[] = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            // Header
            doc.fontSize(20).font('Helvetica-Bold').text(`PURCHASE ORDER`, { align: 'center' });
            doc.moveDown(0.5);

            doc.fontSize(12).font('Helvetica').text(`PO Number: ${purchaseOrder.poNumber}`, { align: 'center' });
            doc.text(`Order Date: ${new Date(purchaseOrder.orderDate).toLocaleDateString()}`, { align: 'center' });
            doc.text(`Site: ${purchaseOrder.site?.name || 'N/A'}`, { align: 'center' });
            doc.moveDown();

            // Supplier Info (if grouped by supplier)
            if (purchaseOrder.supplierName) {
                doc.fontSize(14).font('Helvetica-Bold').text(`Supplier: ${purchaseOrder.supplierName}`);
                doc.moveDown();
            }

            // Items Table Header
            const tableTop = doc.y;
            const itemX = 50;
            const descriptionX = 120;
            const quantityX = 350;
            const uomX = 420;
            const priceX = 470;

            // Table Headers
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Item', itemX, tableTop);
            doc.text('Description', descriptionX, tableTop);
            doc.text('Qty', quantityX, tableTop);
            doc.text('UOM', uomX, tableTop);

            if (includePrices) {
                doc.text('Unit Price', priceX, tableTop);
            }

            doc.moveTo(50, tableTop + 15)
                .lineTo(550, tableTop + 15)
                .stroke();

            let y = tableTop + 25;

            // Items
            doc.fontSize(9).font('Helvetica');
            purchaseOrder.orderedItems.forEach((item: any, index: number) => {
                if (y > 700) { // New page if needed
                    doc.addPage();
                    y = 50;
                }

                doc.text(item.stockItem?.sku || `Item ${index + 1}`, itemX, y);
                doc.text(item.stockItem?.name || 'N/A', descriptionX, y, { width: 220 });
                doc.text(item.orderedQuantity.toString(), quantityX, y);
                doc.text(item.stockItem?.unitOfMeasure || 'EA', uomX, y);

                if (includePrices) {
                    doc.text(`E {(item.unitPrice?.toFixed(2) || '0.00'}`, priceX, y);
                }

                y += 20;
            });

            // Footer
            if (purchaseOrder.notes) {
                doc.moveDown(2);
                doc.fontSize(10).font('Helvetica-Bold').text('Notes:');
                doc.font('Helvetica').text(purchaseOrder.notes, { width: 500 });
            }

            doc.moveDown();
            doc.fontSize(8).font('Helvetica').text(
                `Generated on ${new Date().toLocaleDateString()}`,
                { align: 'center' }
            );

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}