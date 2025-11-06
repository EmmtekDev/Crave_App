import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { CartItem } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { ShoppingCart, Trash2, Minus, Plus } from 'lucide-react-native';

export default function CartScreen() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set());
  const router = useRouter();
  const { user } = useAuth();

  const loadCart = async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select('*, products(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setCartItems(data as CartItem[]);
    } catch (err) {
      console.error('Error loading cart:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCart();
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    loadCart();
  };

  const updateQuantity = async (itemId: string, newQuantity: number, maxStock: number) => {
    if (newQuantity < 1 || newQuantity > maxStock) return;

    setUpdatingItems((prev) => new Set(prev).add(itemId));

    try {
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: newQuantity })
        .eq('id', itemId);

      if (error) throw error;

      setCartItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, quantity: newQuantity } : item))
      );
    } catch (err) {
      console.error('Error updating quantity:', err);
    } finally {
      setUpdatingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  };

  const removeItem = async (itemId: string) => {
    setUpdatingItems((prev) => new Set(prev).add(itemId));

    try {
      const { error } = await supabase.from('cart_items').delete().eq('id', itemId);

      if (error) throw error;

      setCartItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      console.error('Error removing item:', err);
    } finally {
      setUpdatingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  };

  const calculateTotal = () => {
    return cartItems.reduce((total, item) => {
      if (item.products) {
        return total + item.products.price * item.quantity;
      }
      return total;
    }, 0);
  };

  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <ShoppingCart size={64} color="#ccc" />
        <Text style={styles.emptyText}>Please sign in to view your cart</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF7A00" />
      </View>
    );
  }

  if (cartItems.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ShoppingCart size={64} color="#ccc" />
        <Text style={styles.emptyText}>Your cart is empty</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.push('/(tabs)/products')}>
          <Text style={styles.buttonText}>Browse Products</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Shopping Cart</Text>
        <Text style={styles.itemCount}>{cartItems.length} items</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {cartItems.map((item) => {
          if (!item.products) return null;
          const isUpdating = updatingItems.has(item.id);

          return (
            <View key={item.id} style={styles.cartItem}>
              <TouchableOpacity onPress={() => router.push(`/product/${item.products!.id}`)}>
                {item.products.images && item.products.images.length > 0 ? (
                  <Image source={{ uri: item.products.images[0] }} style={styles.itemImage} />
                ) : (
                  <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                    <ShoppingCart size={32} color="#ccc" />
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.itemDetails}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.products.name}
                </Text>
                <Text style={styles.itemPrice}>${item.products.price.toFixed(2)}</Text>

                <View style={styles.itemActions}>
                  <View style={styles.quantityContainer}>
                    <TouchableOpacity
                      style={styles.quantityButton}
                      onPress={() =>
                        updateQuantity(item.id, item.quantity - 1, item.products!.stock_quantity)
                      }
                      disabled={isUpdating}
                    >
                      <Minus size={16} color="#FF7A00" />
                    </TouchableOpacity>
                    <Text style={styles.quantity}>{item.quantity}</Text>
                    <TouchableOpacity
                      style={styles.quantityButton}
                      onPress={() =>
                        updateQuantity(item.id, item.quantity + 1, item.products!.stock_quantity)
                      }
                      disabled={isUpdating}
                    >
                      <Plus size={16} color="#FF7A00" />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity onPress={() => removeItem(item.id)} disabled={isUpdating}>
                    <Trash2 size={20} color="#f44" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.totalContainer}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>${calculateTotal().toFixed(2)}</Text>
        </View>
        <TouchableOpacity style={styles.checkoutButton} onPress={() => router.push('/checkout')}>
          <Text style={styles.checkoutButtonText}>Proceed to Checkout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 20,
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  itemCount: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  cartItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  itemImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  itemPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FF7A00',
    marginVertical: 4,
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 4,
  },
  quantityButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantity: {
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 12,
    minWidth: 24,
    textAlign: 'center',
  },
  footer: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FF7A00',
  },
  checkoutButton: {
    backgroundColor: '#FF7A00',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  checkoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#FF7A00',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
