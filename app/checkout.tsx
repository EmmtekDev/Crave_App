import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { CartItem, UserProfile } from '@/types/database';
import { ArrowLeft, CreditCard, Truck, CheckCircle2 } from 'lucide-react-native';
import { COLORS } from '@/theme/colors';

const SHIPPING_FEE = 2499;

export default function CheckoutScreen() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    loadCheckoutData();
  }, [user]);

  const loadCheckoutData = async () => {
    if (!user) {
      router.replace('/(auth)/login');
      return;
    }

    try {
      const [cartRes, profileRes] = await Promise.all([
        supabase.from('cart_items').select('*, products(*)').eq('user_id', user.id),
        supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle(),
      ]);

      if (cartRes.data) {
        setCartItems(cartRes.data as CartItem[]);
        if (cartRes.data.length === 0) {
          router.replace('/(tabs)/cart');
          return;
        }
      }

      if (profileRes.data) {
        const prof = profileRes.data as UserProfile;
        setProfile(prof);
        setFullName(prof.full_name || '');
        setPhone(prof.phone || '');
        if (prof.address) {
          setStreet(prof.address.street || '');
          setCity(prof.address.city || '');
          setState(prof.address.state || '');
          setCountry(prof.address.country || '');
          setPostalCode(prof.address.postal_code || '');
        }
      }
    } catch (err) {
      console.error('Error loading checkout data:', err);
    } finally {
      setLoading(false);
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

  const validateForm = () => {
    if (!fullName.trim()) return 'Please enter your full name';
    if (!phone.trim()) return 'Please enter your phone number';
    if (!street.trim()) return 'Please enter your street address';
    if (!city.trim()) return 'Please enter your city';
    if (!state.trim()) return 'Please enter your state';
    if (!country.trim()) return 'Please enter your country';
    return null;
  };

  const handlePlaceOrder = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const totalAmount = calculateTotal();
      const shippingAddress = { street, city, state, country, postal_code: postalCode };

      await supabase.from('user_profiles').upsert({
        id: user!.id,
        full_name: fullName,
        phone,
        address: shippingAddress,
      });

      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user!.id,
          order_number: orderNumber,
          total_amount: totalAmount,
          status: 'pending',
          payment_status: 'pending',
          shipping_address: shippingAddress,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = cartItems.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.products!.price,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

      if (itemsError) throw itemsError;

      await supabase.from('cart_items').delete().eq('user_id', user!.id);

      Alert.alert(
        'Order Placed!',
        `Your order ${orderNumber} has been placed successfully. Total: $${totalAmount.toFixed(2)}. Payment integration with Flutterwave will be added soon.`,
        [{ text: 'OK', onPress: () => router.replace('/orders') }]
      );
    } catch (err: any) {
      setError(err.message || 'Failed to place order');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          {cartItems.map((item) => {
            if (!item.products) return null;
            return (
              <View key={item.id} style={styles.orderItem}>
                <Text style={styles.orderItemName} numberOfLines={1}>
                  {item.products.name} x{item.quantity}
                </Text>
                <Text style={styles.orderItemPrice}>${(item.products.price * item.quantity).toFixed(2)}</Text>
              </View>
            );
          })}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>${calculateTotal().toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          <TextInput
            style={styles.input}
            placeholder="Full Name *"
            value={fullName}
            onChangeText={setFullName}
            editable={!processing}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone Number *"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            editable={!processing}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shipping Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Street Address *"
            value={street}
            onChangeText={setStreet}
            editable={!processing}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="City *"
              value={city}
              onChangeText={setCity}
              editable={!processing}
            />
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="State *"
              value={state}
              onChangeText={setState}
              editable={!processing}
            />
          </View>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Country *"
              value={country}
              onChangeText={setCountry}
              editable={!processing}
            />
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Postal Code"
              value={postalCode}
              onChangeText={setPostalCode}
              editable={!processing}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <View style={styles.paymentNote}>
            <CreditCard size={24} color={COLORS.primary} />
            <Text style={styles.paymentNoteText}>
              Flutterwave payment integration will be available soon. Your order will be created with pending
              payment status.
            </Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.placeOrderButton, processing && styles.placeOrderButtonDisabled]}
          onPress={handlePlaceOrder}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.placeOrderButtonText}>Place Order - ${calculateTotal().toFixed(2)}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: COLORS.surface,
    marginTop: 16,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  orderItemName: {
    fontSize: 14,
    color: COLORS.textSecondary,
    flex: 1,
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: COLORS.background,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  paymentNote: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFF5E6',
    borderRadius: 12,
    gap: 12,
    alignItems: 'center',
  },
  paymentNoteText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.primary,
    lineHeight: 20,
  },
  error: {
    backgroundColor: COLORS.errorBg,
    color: COLORS.error,
    padding: 16,
    margin: 16,
    borderRadius: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  placeOrderButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  placeOrderButtonDisabled: {
    opacity: 0.6,
  },
  placeOrderButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
