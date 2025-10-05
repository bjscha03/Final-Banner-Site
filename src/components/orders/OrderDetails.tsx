                    <div className="text-right ml-4">
                      <p className="font-semibold text-gray-900">
                        {usd((item.line_total_cents || 0) / 100)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {usd((item.unit_price_cents || 0) / 100)} each
                      </p>
                      <div className="mt-2 space-y-2">
                        {/* Admin File Download Button */}
                        {isAdminUser && item.file_key && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFileDownload(item.file_key!, index)}
                            className="w-full"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download File
                          </Button>
                        )}
                        {isAdminUser && !item.file_key && (
                          <div className="text-xs text-gray-500 text-center py-1">
                            <FileText className="h-3 w-3 inline mr-1" />
                            No file uploaded
                          </div>
                        )}
                        {/* Reorder Button - Show for non-admin users only */}
                        {!isAdminUser && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReorder(index)}
                            className="w-full"
                          >
                            <ShoppingCart className="h-3 w-3 mr-1" />
                            Reorder
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Total */}
          <div className="border-t border-gray-200 pt-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Subtotal</span>
              <span className="text-gray-900">
                {usd((order.subtotal_cents || order.total_cents) / 100)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Tax (6%)</span>
              <span className="text-gray-900">
                {usd((order.tax_cents || 0) / 100)}
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-200 pt-2">
              <span className="text-lg font-semibold text-gray-900">Total</span>
              <span className="text-xl font-bold text-gray-900">
                {usd(order.total_cents / 100)}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetails;
