import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Smartphone, 
  Eye, 
  AlertTriangle, 
  ShoppingCart, 
  XOctagon, 
  Search, 
  ScanLine,
  Activity,
  TrendingUp,
  Filter,
  RefreshCw,
  Package,
  Clock,
  Settings
} from "lucide-react";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import MobileNav from "@/components/layout/mobile-nav";
import Footer from "@/components/layout/footer";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Product {
  id: number;
  clientId: number;
  imei: string;
  model: string;
  storage: string;
  color: string;
  status: 'disponible' | 'reservado' | 'vendido' | 'tecnico_interno' | 'tecnico_externo' | 'a_reparar' | 'extravio';
  costPrice: number;
  salePrice?: number;
  observations?: string;
  createdAt: string;
  updatedAt?: string;
  entryDate?: string;
}

interface ScannedItem {
  imei: string;
  product?: Product;
  timestamp: Date;
  status: 'found' | 'not_found';
}

export default function StockControlFinal() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [isScanning, setIsScanning] = useState(false);
  const [imeiInput, setImeiInput] = useState("");
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [sessionStartCounts, setSessionStartCounts] = useState<{
    disponible: number;
    reservado: number;
    tecnico_interno: number;
    total: number;
  }>({ disponible: 0, reservado: 0, tecnico_interno: 0, total: 0 });
  const [missingProducts, setMissingProducts] = useState<Product[]>([]);
  
  const imeiInputRef = useRef<HTMLInputElement>(null);

  // Fetch products
  const { data: products = [], isLoading: productsLoading, refetch } = useQuery({
    queryKey: ['/api/products', user?.clientId],
    queryFn: async () => {
      const response = await fetch(`/api/products?clientId=${user?.clientId}`);
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await response.json();
      console.log('Products fetched:', data); // Debug log
      return data;
    },
    enabled: !!user?.clientId,
    refetchOnMount: 'always',
    staleTime: 0, // Always consider data stale to force refresh
  });

  // Calculate comprehensive stats
  const productArray = Array.isArray(products) ? products : [];
  console.log('Product array length:', productArray.length, 'Products:', productArray); // Debug log
  
  const stats = {
    total: productArray.length,
    disponible: productArray.filter(p => p.status === 'disponible').length,
    reservado: productArray.filter(p => p.status === 'reservado').length,
    vendido: productArray.filter(p => p.status === 'vendido').length,
    tecnico_interno: productArray.filter(p => p.status === 'tecnico_interno').length,
    extravios: productArray.filter(p => p.status === 'extravio').length,
    totalValue: productArray.reduce((sum, p) => sum + (Number(p.costPrice) || 0), 0),
    availableValue: productArray.filter(p => p.status === 'disponible').reduce((sum, p) => sum + (Number(p.costPrice) || 0), 0),
    reservedValue: productArray.filter(p => p.status === 'reservado').reduce((sum, p) => sum + (Number(p.costPrice) || 0), 0),
    topModels: productArray.reduce((acc, p) => {
      acc[p.model] = (acc[p.model] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    topColors: productArray.reduce((acc, p) => {
      acc[p.color] = (acc[p.color] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    averagePrice: productArray.length > 0 ? productArray.reduce((sum, p) => sum + (Number(p.costPrice) || 0), 0) / productArray.length : 0,
  };
  
  console.log('Calculated stats:', stats); // Debug log

  // Calculate dynamic counts during scanning session
  const scannedIMEIs = scannedItems.map(item => item.imei);
  const scannedProducts = productArray.filter(p => scannedIMEIs.includes(p.imei));
  
  const dynamicStats = {
    ...stats,
    disponible: stats.disponible - scannedProducts.filter(p => p.status === 'disponible').length,
    reservado: stats.reservado - scannedProducts.filter(p => p.status === 'reservado').length,
    tecnico_interno: stats.tecnico_interno - scannedProducts.filter(p => p.status === 'tecnico_interno').length,
    scannedCount: scannedItems.length,
    expectedTotal: sessionStartCounts.total > 0 ? sessionStartCounts.total : stats.total,
    pendingToScan: sessionStartCounts.total > 0 ? sessionStartCounts.total - scannedItems.length : 0,
  };

  // Detect missing products when scanning session ends
  const detectMissingProducts = () => {
    if (!isScanning && scannedItems.length > 0 && sessionStartCounts.total > 0) {
      const expectedProducts = productArray.filter(p => 
        p.status === 'disponible' || p.status === 'reservado' || p.status === 'tecnico_interno'
      );
      const notScannedProducts = expectedProducts.filter(p => 
        !scannedIMEIs.includes(p.imei)
      );
      setMissingProducts(notScannedProducts);
      
      if (notScannedProducts.length > 0) {
        toast({
          title: "⚠️ Productos No Encontrados",
          description: `Faltan ${notScannedProducts.length} productos en el conteo físico`,
          variant: "destructive",
        });
      }
    }
  };

  // Filter products
  const filteredProducts = productArray.filter(product => {
    const matchesFilter = activeFilter === 'all' || product.status === activeFilter;
    const matchesSearch = searchQuery === '' || 
      product.imei.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.color.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  // Initialize scanning session
  const startScanningSession = () => {
    const scannableProducts = productArray.filter(p => 
      p.status === 'disponible' || p.status === 'reservado' || p.status === 'tecnico_interno'
    );
    
    setSessionStartCounts({
      disponible: productArray.filter(p => p.status === 'disponible').length,
      reservado: productArray.filter(p => p.status === 'reservado').length,
      tecnico_interno: productArray.filter(p => p.status === 'tecnico_interno').length,
      total: scannableProducts.length,
    });
    
    setScannedItems([]);
    setMissingProducts([]);
    setIsScanning(true);
    
    toast({
      title: "📱 Control de Stock Iniciado",
      description: `Esperando ${scannableProducts.length} productos (${stats.disponible} disponibles, ${stats.reservado} reservados, ${stats.tecnico_interno} técnico interno)`,
    });
    
    // Focus on input field
    setTimeout(() => {
      imeiInputRef.current?.focus();
    }, 100);
  };

  // Finalize scanning session
  const finalizeScanningSession = () => {
    setIsScanning(false);
    
    const scannedCount = scannedItems.length;
    const expectedCount = sessionStartCounts.total;
    
    // Detect missing products immediately - now includes tecnico_interno
    const expectedProducts = productArray.filter(p => 
      p.status === 'disponible' || p.status === 'reservado' || p.status === 'tecnico_interno'
    );
    const scannedIMEIs = scannedItems.map(item => item.imei);
    const notScannedProducts = expectedProducts.filter(p => 
      !scannedIMEIs.includes(p.imei)
    );
    
    setMissingProducts(notScannedProducts);
    
    if (scannedCount === expectedCount && notScannedProducts.length === 0) {
      toast({
        title: "✅ Control Completado Perfecto",
        description: `Todos los ${scannedCount} productos fueron verificados correctamente`,
      });
    } else if (notScannedProducts.length > 0) {
      toast({
        title: "🚨 Productos Faltantes Detectados",
        description: `${notScannedProducts.length} productos no encontrados en el depósito físico`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "⚠️ Control Incompleto", 
        description: `Escaneados: ${scannedCount}/${expectedCount} productos`,
        variant: "destructive",
      });
    }
  };

  // Handle viewing product history
  const handleViewProductHistory = (product: Product) => {
    toast({
      title: "📋 Historial del Producto",
      description: `${product.model} - IMEI: ${product.imei} - Ingresado: ${new Date(product.createdAt).toLocaleDateString('es-AR')}`,
    });
  };

  // Handle marking product as lost/extravío
  const handleMarkAsLost = async (product: Product) => {
    try {
      console.log(`Marking product ${product.id} as lost:`, product);
      const response = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'extravio',
          observations: `Marcado como extravío desde Control de Stock - ${new Date().toLocaleDateString('es-AR')}`,
          userId: user?.id
        }),
      });

      console.log('Mark as lost response:', response.status, response.ok);
      
      if (response.ok) {
        // Remove from missing products list
        setMissingProducts(prev => prev.filter(p => p.id !== product.id));
        
        // Force cache invalidation and refetch
        await queryClient.invalidateQueries({ queryKey: ['/api/products', user?.clientId] });
        await refetch();
        
        toast({
          title: "✅ Estado Actualizado",
          description: `${product.model} marcado como extravío`,
        });
      } else {
        const errorData = await response.json();
        console.error('Error response:', errorData);
        toast({
          title: "❌ Error",
          description: `Error al actualizar: ${errorData.message || 'Error desconocido'}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Mark as lost error:', error);
      toast({
        title: "❌ Error",
        description: "No se pudo actualizar el estado del producto",
        variant: "destructive",
      });
    }
  };

  // Handle marking product as found (from extravío to disponible)
  const handleMarkAsFound = async (product: Product) => {
    try {
      console.log(`Marking product ${product.id} as found:`, product);
      const response = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'disponible',
          observations: `Encontrado y restaurado desde Control de Stock - ${new Date().toLocaleDateString('es-AR')}`,
          userId: user?.id
        }),
      });

      console.log('Mark as found response:', response.status, response.ok);

      if (response.ok) {
        // Force cache invalidation and refetch
        await queryClient.invalidateQueries({ queryKey: ['/api/products', user?.clientId] });
        await refetch();
        
        toast({
          title: "🎉 Producto Encontrado",
          description: `${product.model} restaurado como disponible`,
        });
      } else {
        const errorData = await response.json();
        console.error('Error response:', errorData);
        toast({
          title: "❌ Error",
          description: `Error al actualizar: ${errorData.message || 'Error desconocido'}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Mark as found error:', error);
      toast({
        title: "❌ Error",
        description: "No se pudo actualizar el estado del producto",
        variant: "destructive",
      });
    }
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (imeiInput.trim()) {
      const existingProduct = productArray.find(p => p.imei === imeiInput.trim());
      const alreadyScanned = scannedItems.find(item => item.imei === imeiInput.trim());
      
      // Only allow scanning of available, reserved, and tecnico_interno products
      if (existingProduct && existingProduct.status !== 'disponible' && existingProduct.status !== 'reservado' && existingProduct.status !== 'tecnico_interno') {
        toast({
          title: "🚫 Producto No Válido",
          description: `Este producto está "${existingProduct.status}" y no requiere verificación física`,
          variant: "destructive",
        });
        setImeiInput("");
        return;
      }
      
      if (!alreadyScanned) {
        const newItem: ScannedItem = {
          imei: imeiInput.trim(),
          product: existingProduct,
          timestamp: new Date(),
          status: existingProduct ? 'found' : 'not_found'
        };
        setScannedItems(prev => [newItem, ...prev]);
        
        if (existingProduct) {
          toast({
            title: "✅ Producto Verificado",
            description: `${existingProduct.model} - ${existingProduct.color} (${existingProduct.status}) confirmado`,
          });
        } else {
          toast({
            title: "❌ IMEI No Encontrado",
            description: `El IMEI ${imeiInput.trim()} no existe en el inventario disponible/reservado`,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "⚠️ IMEI Ya Escaneado",
          description: `Este producto ya fue verificado en esta sesión`,
          variant: "destructive",
        });
      }
      setImeiInput("");
    }
  };

  const toggleScanning = () => {
    if (!isScanning) {
      setIsScanning(true);
      setScannedItems([]);
      setTimeout(() => imeiInputRef.current?.focus(), 100);
    } else {
      setIsScanning(false);
      toast({
        title: "Sesión Finalizada",
        description: `Se verificaron ${scannedItems.length} productos`,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const badgeMap: Record<string, JSX.Element> = {
      'disponible': <Badge className="bg-green-100 text-green-800 border-green-300">Disponible</Badge>,
      'reservado': <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Reservado</Badge>,
      'vendido': <Badge className="bg-blue-100 text-blue-800 border-blue-300">Vendido</Badge>,
      'extravio': <Badge className="bg-red-100 text-red-800 border-red-300">Extravío</Badge>,
    };
    return badgeMap[status] || <Badge variant="outline">{status}</Badge>;
  };

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <Header onMobileMenuToggle={() => setMobileNavOpen(true)} />
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 bg-gray-50 dark:bg-gray-900 min-w-0">
          <div className="px-4 sm:px-6 lg:px-8 py-8">
            
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-gray-900 dark:text-white">Control de Stock Avanzado</CardTitle>
                  <div className="flex gap-3">
                    <Button onClick={() => refetch()} variant="outline" size="sm">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Actualizar
                    </Button>
                    {!isScanning ? (
                      <Button onClick={startScanningSession} className="bg-green-600 hover:bg-green-700">
                        <ScanLine className="w-4 h-4 mr-2" />
                        Iniciar Control
                      </Button>
                    ) : (
                      <Button onClick={finalizeScanningSession} className="bg-red-600 hover:bg-red-700">
                        <XOctagon className="w-4 h-4 mr-2" />
                        Finalizar Control
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">

                {/* Stock Control Dashboard - Only 3 States */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* DISPONIBLES */}
                  <div className="border-l-4 border-l-green-500 bg-gradient-to-r from-green-50 to-white dark:from-green-950/50 dark:to-gray-900 p-6 rounded-lg border shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-green-600 dark:text-green-400 mb-1">
                          DISPONIBLES {isScanning && <span className="text-xs">(Live)</span>}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-3xl font-bold text-green-800 dark:text-green-200">
                            {isScanning ? dynamicStats.disponible : stats.disponible}
                          </p>
                          {isScanning && dynamicStats.disponible !== stats.disponible && (
                            <span className="text-sm text-red-600 animate-pulse">
                              -{stats.disponible - dynamicStats.disponible}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-green-600 mt-1">
                          Para verificación física
                        </p>
                      </div>
                      <div className="p-3 bg-green-100 dark:bg-green-800/50 rounded-full">
                        <Eye className="w-8 h-8 text-green-600 dark:text-green-300" />
                      </div>
                    </div>
                  </div>

                  {/* RESERVADOS */}
                  <div className="border-l-4 border-l-yellow-500 bg-gradient-to-r from-yellow-50 to-white dark:from-yellow-950/50 dark:to-gray-900 p-6 rounded-lg border shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 mb-1">
                          RESERVADOS {isScanning && <span className="text-xs">(Live)</span>}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-3xl font-bold text-yellow-800 dark:text-yellow-200">
                            {isScanning ? dynamicStats.reservado : stats.reservado}
                          </p>
                          {isScanning && dynamicStats.reservado !== stats.reservado && (
                            <span className="text-sm text-red-600 animate-pulse">
                              -{stats.reservado - dynamicStats.reservado}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-yellow-600 mt-1">
                          Para verificación física
                        </p>
                      </div>
                      <div className="p-3 bg-yellow-100 dark:bg-yellow-800/50 rounded-full">
                        <AlertTriangle className="w-8 h-8 text-yellow-600 dark:text-yellow-300" />
                      </div>
                    </div>
                  </div>

                  {/* TÉCNICO INTERNO */}
                  <div className="border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50 to-white dark:from-blue-950/50 dark:to-gray-900 p-6 rounded-lg border shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-1">
                          TÉCNICO INTERNO {isScanning && <span className="text-xs">(Live)</span>}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-3xl font-bold text-blue-800 dark:text-blue-200">
                            {isScanning ? dynamicStats.tecnico_interno : stats.tecnico_interno}
                          </p>
                          {isScanning && dynamicStats.tecnico_interno !== stats.tecnico_interno && (
                            <span className="text-sm text-red-600 animate-pulse">
                              -{stats.tecnico_interno - dynamicStats.tecnico_interno}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-blue-600 mt-1">
                          En depósito para reparación
                        </p>
                      </div>
                      <div className="p-3 bg-blue-100 dark:bg-blue-800/50 rounded-full">
                        <Settings className="w-8 h-8 text-blue-600 dark:text-blue-300" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Advanced Analytics Panel */}
                {productArray.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-purple-950/30 dark:via-blue-950/30 dark:to-indigo-950/30 p-6 rounded-xl border border-purple-200 dark:border-purple-800">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-purple-100 dark:bg-purple-800/50 rounded-lg">
                          <TrendingUp className="w-6 h-6 text-purple-600 dark:text-purple-300" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">Análisis de Inventario</h3>
                          <p className="text-purple-600 dark:text-purple-400 text-sm">Modelos más populares en stock</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(stats.topModels)
                          .sort(([,a], [,b]) => (b as number) - (a as number))
                          .slice(0, 4)
                          .map(([model, count], index) => {
                            const percentage = Math.round(((count as number) / productArray.length) * 100);
                            const modelProducts = productArray.filter(p => p.model === model);
                            const availableCount = modelProducts.filter(p => p.status === 'disponible').length;
                            
                            return (
                              <div key={model} className="bg-white/70 dark:bg-gray-800/70 p-4 rounded-lg border border-purple-100 dark:border-purple-800/50 hover:shadow-md transition-all">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <h4 className="font-medium text-purple-900 dark:text-purple-100 leading-tight">{model}</h4>
                                    <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
                                      {count as number} unidades • {percentage}% del stock
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <div className="w-10 h-10 bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-800/50 dark:to-indigo-800/50 rounded-full flex items-center justify-center">
                                      <span className="text-sm font-bold text-purple-600 dark:text-purple-300">#{index + 1}</span>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="space-y-2">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-green-600 dark:text-green-400">Disponibles: {availableCount}</span>
                                    <span className="text-gray-500">Otros: {(count as number) - availableCount}</span>
                                  </div>
                                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                    <div 
                                      className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
                                      style={{ width: `${percentage}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950/30 dark:via-teal-950/30 dark:to-cyan-950/30 p-6 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-800/50 rounded-lg">
                          <Activity className="w-6 h-6 text-emerald-600 dark:text-emerald-300" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">Métricas Clave</h3>
                          <p className="text-emerald-600 dark:text-emerald-400 text-sm">Resumen financiero</p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="bg-white/70 dark:bg-gray-800/70 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800/50">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Valor Disponible</span>
                            <span className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
                              ${stats.availableValue.toLocaleString('es-AR')}
                            </span>
                          </div>
                          <div className="w-full bg-emerald-100 dark:bg-emerald-800/30 rounded-full h-3">
                            <div 
                              className="bg-gradient-to-r from-emerald-500 to-teal-500 h-3 rounded-full transition-all duration-500"
                              style={{ width: `${stats.totalValue > 0 ? (stats.availableValue / stats.totalValue) * 100 : 0}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="bg-white/70 dark:bg-gray-800/70 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800/50">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Valor Reservado</span>
                            <span className="text-lg font-bold text-yellow-800 dark:text-yellow-200">
                              ${stats.reservedValue.toLocaleString('es-AR')}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {stats.reservado} productos en proceso
                          </div>
                        </div>

                        <div className="bg-white/70 dark:bg-gray-800/70 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800/50">
                          <div className="text-center">
                            <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-1">Precio Promedio</div>
                            <div className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">
                              ${Math.round(stats.averagePrice).toLocaleString('es-AR')}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">por producto</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-center p-2 bg-white/50 dark:bg-gray-800/50 rounded-lg">
                            <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{stats.disponible}</div>
                            <div className="text-xs text-emerald-600 dark:text-emerald-400">Listos</div>
                          </div>
                          <div className="text-center p-2 bg-white/50 dark:bg-gray-800/50 rounded-lg">
                            <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{stats.total - stats.disponible}</div>
                            <div className="text-xs text-emerald-600 dark:text-emerald-400">Procesados</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scanning Progress Panel */}
                {isScanning && (
                  <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-purple-950/30 p-6 rounded-xl border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-blue-100 dark:bg-blue-800/50 rounded-lg">
                        <Activity className="w-6 h-6 text-blue-600 dark:text-blue-300" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">Control en Progreso</h3>
                        <p className="text-blue-600 dark:text-blue-400 text-sm">
                          Progreso: {scannedItems.length}/{sessionStartCounts.total} productos verificados
                        </p>
                        <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                          ⚠️ Solo productos "Disponible", "Reservado" y "Técnico Interno" pueden ser escaneados
                        </p>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm font-medium text-blue-700 dark:text-blue-300">
                        <span>Avance del Control</span>
                        <span>{sessionStartCounts.total > 0 ? Math.round((scannedItems.length / sessionStartCounts.total) * 100) : 0}%</span>
                      </div>
                      <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-4">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-purple-500 h-4 rounded-full transition-all duration-500 flex items-center justify-center"
                          style={{ width: `${sessionStartCounts.total > 0 ? (scannedItems.length / sessionStartCounts.total) * 100 : 0}%` }}
                        >
                          {scannedItems.length > 0 && (
                            <span className="text-white text-xs font-bold">{scannedItems.length}</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3 mt-4">
                        <div className="text-center p-3 bg-white/70 dark:bg-gray-800/70 rounded-lg">
                          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{scannedItems.length}</div>
                          <div className="text-xs text-blue-500">Escaneados</div>
                        </div>
                        <div className="text-center p-3 bg-white/70 dark:bg-gray-800/70 rounded-lg">
                          <div className="text-lg font-bold text-orange-600 dark:text-orange-400">{dynamicStats.pendingToScan}</div>
                          <div className="text-xs text-orange-500">Pendientes</div>
                        </div>
                        <div className="text-center p-3 bg-white/70 dark:bg-gray-800/70 rounded-lg">
                          <div className="text-lg font-bold text-green-600 dark:text-green-400">{sessionStartCounts.total}</div>
                          <div className="text-xs text-green-500">Total</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Missing Products Alert - Enhanced */}
                {!isScanning && missingProducts.length > 0 && (
                  <div className="bg-gradient-to-r from-red-50 via-orange-50 to-yellow-50 dark:from-red-950/30 dark:via-orange-950/30 dark:to-yellow-950/30 p-6 rounded-xl border-2 border-red-300 dark:border-red-600 shadow-lg animate-pulse">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-red-100 dark:bg-red-800/50 rounded-lg animate-bounce">
                        <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-300" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-red-900 dark:text-red-100">🚨 PRODUCTOS PERDIDOS DETECTADOS</h3>
                        <p className="text-red-700 dark:text-red-300 text-lg font-semibold">
                          {missingProducts.length} productos no fueron encontrados en el depósito físico
                        </p>
                        <p className="text-red-600 dark:text-red-400 text-sm mt-1">
                          Estos productos existen en el sistema pero no están físicamente presentes
                        </p>
                      </div>
                    </div>
                    
                    {/* Summary Statistics */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-lg border border-red-200 dark:border-red-700">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-red-600 dark:text-red-400">{missingProducts.length}</div>
                          <div className="text-sm text-red-800 dark:text-red-200">Productos Perdidos</div>
                        </div>
                      </div>
                      <div className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-lg border border-red-200 dark:border-red-700">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                            {missingProducts.filter(p => p.status === 'disponible').length}
                          </div>
                          <div className="text-sm text-red-800 dark:text-red-200">Disponibles Perdidos</div>
                        </div>
                      </div>
                      <div className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-lg border border-red-200 dark:border-red-700">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                            ${missingProducts.reduce((sum, p) => sum + Number(p.costPrice), 0).toLocaleString('es-AR')}
                          </div>
                          <div className="text-sm text-red-800 dark:text-red-200">Valor Total Perdido</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {missingProducts.map((product) => (
                        <div key={product.id} className="bg-white/70 dark:bg-gray-800/70 p-3 rounded-lg border border-red-100 dark:border-red-800/50">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-red-900 dark:text-red-100">{product.model}</div>
                              <div className="text-sm text-red-600 dark:text-red-400">
                                IMEI: {product.imei} • {product.color} • {product.storage}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Ingreso: {product.entryDate ? new Date(product.entryDate).toLocaleDateString('es-AR') : 'N/A'}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {getStatusBadge(product.status)}
                              <div className="text-sm font-medium text-red-700 dark:text-red-300">
                                ${Number(product.costPrice).toLocaleString('es-AR')}
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                                  onClick={() => handleViewProductHistory(product)}
                                >
                                  Historial
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-8 px-2 text-xs bg-red-600 hover:bg-red-700"
                                  onClick={() => handleMarkAsLost(product)}
                                >
                                  Marcar Extravío
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 mt-6">
                      <Button 
                        onClick={() => {
                          setMissingProducts([]);
                          setScannedItems([]);
                          setSessionStartCounts({ disponible: 0, reservado: 0, tecnico_interno: 0, total: 0 });
                          toast({
                            title: "📋 Lista Limpiada",
                            description: "Productos faltantes eliminados de la vista",
                          });
                        }}
                        variant="outline" 
                        className="border-orange-300 text-orange-700 hover:bg-orange-50"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Limpiar Lista
                      </Button>
                      
                      <Button 
                        onClick={startScanningSession} 
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <ScanLine className="w-4 h-4 mr-2" />
                        Nuevo Control
                      </Button>
                    </div>
                    
                    <div className="mt-6 p-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg border border-yellow-300 dark:border-yellow-700">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Acciones Recomendadas:</h4>
                          <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                            <li>• Verifique la ubicación física de estos productos en el depósito</li>
                            <li>• Actualice el estado a "extravío" si no los encuentra</li>
                            <li>• Revise si fueron vendidos pero no actualizados en el sistema</li>
                            <li>• Considere realizar un inventario físico completo</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Enhanced Scanner Interface */}
                {isScanning && (
                  <div className="border-2 border-dashed border-cyan-300 dark:border-cyan-600 bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-50 dark:from-cyan-950/50 dark:via-blue-950/50 dark:to-indigo-950/50 p-6 rounded-lg">
                    <div className="text-center mb-6">
                      <div className="flex items-center justify-center gap-3 text-xl text-cyan-800 dark:text-cyan-200 mb-2">
                        <div className="p-2 bg-cyan-100 dark:bg-cyan-800/50 rounded-full animate-pulse">
                          <Activity className="w-6 h-6 text-cyan-600 dark:text-cyan-300" />
                        </div>
                        Sesión de Escaneo Activa
                      </div>
                      <p className="text-cyan-600 dark:text-cyan-400">
                        Escanea o ingresa códigos IMEI para verificación inmediata
                      </p>
                      <div className="flex items-center justify-center gap-2 mt-3">
                        <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">✓ Disponible</Badge>
                        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 text-xs">✓ Reservado</Badge>
                        <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">✗ Otros estados no válidos</Badge>
                      </div>
                    </div>
                    
                    <form onSubmit={handleScan} className="flex gap-4 max-w-2xl mx-auto mb-6">
                      <div className="flex-1 relative">
                        <Input
                          ref={imeiInputRef}
                          value={imeiInput}
                          onChange={(e) => setImeiInput(e.target.value)}
                          placeholder="Escanear o ingresar IMEI..."
                          className="font-mono text-lg h-12 text-center border-2 border-cyan-200 dark:border-cyan-700 focus:border-cyan-500 dark:focus:border-cyan-400 bg-white/80 dark:bg-gray-800/80"
                          autoFocus
                        />
                        <ScanLine className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-cyan-500 dark:text-cyan-400" />
                      </div>
                      <Button type="submit" size="lg" className="px-6 h-12 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700">
                        <ScanLine className="w-4 h-4 mr-2" />
                        Verificar IMEI
                      </Button>
                    </form>

                    {scannedItems.length > 0 && (
                      <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-cyan-200 dark:border-cyan-700 p-4 rounded-lg max-h-48 overflow-y-auto">
                        <h4 className="font-semibold mb-3 text-cyan-800 dark:text-cyan-200">
                          Historial de Verificación ({scannedItems.length} elementos)
                        </h4>
                        <div className="space-y-2">
                          {scannedItems.slice(0, 5).map((item, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-white/80 dark:bg-gray-800/80 rounded border border-cyan-100 dark:border-cyan-800">
                              <div className="flex items-center gap-3">
                                <code className="text-sm font-medium bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                  {item.imei}
                                </code>
                                {item.product && (
                                  <div className="text-sm">
                                    <span className="font-medium">{item.product.model}</span>
                                    <span className="text-gray-500 ml-2">• {item.product.color}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {item.product && getStatusBadge(item.product.status)}
                                {item.status === 'found' ? (
                                  <Badge className="bg-green-100 text-green-800 border-green-300">
                                    <Eye className="w-3 h-3 mr-1" />
                                    Encontrado
                                  </Badge>
                                ) : (
                                  <Badge className="bg-red-100 text-red-800 border-red-300">
                                    <XOctagon className="w-3 h-3 mr-1" />
                                    No Registrado
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Show Available, Reserved and Tecnico Interno counters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-4 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-green-600 dark:text-green-400 mb-1">DISPONIBLE</p>
                        <p className="text-2xl font-bold text-green-800 dark:text-green-200">{stats.disponible}</p>
                        <p className="text-xs text-green-600 mt-1">Para verificación física</p>
                      </div>
                      <div className="p-2 bg-green-100 dark:bg-green-800/50 rounded-full">
                        <Package className="w-6 h-6 text-green-600 dark:text-green-300" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 mb-1">RESERVADO</p>
                        <p className="text-2xl font-bold text-yellow-800 dark:text-yellow-200">{stats.reservado}</p>
                        <p className="text-xs text-yellow-600 mt-1">Para verificación física</p>
                      </div>
                      <div className="p-2 bg-yellow-100 dark:bg-yellow-800/50 rounded-full">
                        <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-300" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-1">TÉCNICO INTERNO</p>
                        <p className="text-2xl font-bold text-blue-800 dark:text-blue-200">{stats.tecnico_interno}</p>
                        <p className="text-xs text-blue-600 mt-1">En depósito para reparación</p>
                      </div>
                      <div className="p-2 bg-blue-100 dark:bg-blue-800/50 rounded-full">
                        <Settings className="w-6 h-6 text-blue-600 dark:text-blue-300" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Extravíos Section */}
                {stats.extravios > 0 && (
                  <div className="mt-6 bg-gradient-to-r from-red-50 via-orange-50 to-yellow-50 dark:from-red-950/30 dark:via-orange-950/30 dark:to-yellow-950/30 p-6 rounded-xl border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-red-100 dark:bg-red-800/50 rounded-lg">
                        <XOctagon className="w-6 h-6 text-red-600 dark:text-red-300" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-red-900 dark:text-red-100">Productos en Extravío</h3>
                        <p className="text-red-600 dark:text-red-400 text-sm">
                          {stats.extravios} productos marcados como perdidos
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {productArray
                        .filter(p => p.status === 'extravio')
                        .map((product) => (
                          <div key={product.id} className="bg-white/70 dark:bg-gray-800/70 p-3 rounded-lg border border-red-100 dark:border-red-800/50">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-red-900 dark:text-red-100">{product.model}</div>
                                <div className="text-sm text-red-600 dark:text-red-400">
                                  IMEI: {product.imei} • {product.color} • {product.storage}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Marcado: {new Date(product.updatedAt || product.createdAt).toLocaleDateString('es-AR')}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {getStatusBadge(product.status)}
                                <div className="text-sm font-medium text-red-700 dark:text-red-300">
                                  ${Number(product.costPrice).toLocaleString('es-AR')}
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-xs border-green-300 text-green-700 hover:bg-green-50"
                                  onClick={() => handleMarkAsFound(product)}
                                >
                                  Marcar Encontrado
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>

          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}