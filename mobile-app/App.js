import { StatusBar } from 'expo-status-bar';
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, Switch, ScrollView,
  SafeAreaView, Platform, KeyboardAvoidingView
} from 'react-native';

export default function App() {
  // Pre-fill with the IP address we found earlier.
  // When deploying to cloud, this will change to wss://cloud-url.com
  const [serverUrl, setServerUrl] = useState('ws://10.160.226.175:3000');
  const [upstoxToken, setUpstoxToken] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [livePrice, setLivePrice] = useState(null);
  const [signals, setSignals] = useState([]);
  const ws = useRef(null);

  const toggleConnection = () => {
    if (isConnected) {
      if (ws.current) ws.current.close();
      setIsConnected(false);
    } else {
      connectWebSocket();
    }
  };

  const connectWebSocket = () => {
    try {
      ws.current = new WebSocket(serverUrl);

      ws.current.onopen = () => {
        setIsConnected(true);
      };

      ws.current.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'price') {
            setLivePrice(data.price);
          } else if (data.type === 'signal') {
            setSignals((prev) => [data.signal, ...prev]);
          }
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      ws.current.onclose = () => {
        setIsConnected(false);
      };

      ws.current.onerror = (e) => {
        console.error('WebSocket error:', e.message);
        setIsConnected(false);
      };
    } catch (err) {
      console.error(err);
      setIsConnected(false);
    }
  };

  useEffect(() => {
    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>BN-Strike AI</Text>
          <View style={styles.statusBadge(isConnected)}>
            <Text style={styles.statusText}>{isConnected ? 'LIVE' : 'OFFLINE'}</Text>
          </View>
        </View>

        <ScrollView style={styles.flex1} contentContainerStyle={styles.scrollContent}>
          
          {/* Settings Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Agent Configuration</Text>
            
            <Text style={styles.label}>Cloud Server URL</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="ws://your-server-ip:3000"
              placeholderTextColor="#666"
            />

            <Text style={styles.label}>Upstox API Token (Optional, for auto-execution)</Text>
            <TextInput
              style={styles.input}
              value={upstoxToken}
              onChangeText={setUpstoxToken}
              placeholder="Paste your Upstox access token here"
              placeholderTextColor="#666"
              secureTextEntry={true}
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{isConnected ? 'Disconnect Engine' : 'Connect to Engine'}</Text>
              <Switch
                value={isConnected}
                onValueChange={toggleConnection}
                trackColor={{ false: '#333', true: '#00D84A' }}
                thumbColor={'#fff'}
              />
            </View>
          </View>

          {/* Pricing Dash */}
          {isConnected && (
            <View style={styles.priceDataContainer}>
               <Text style={styles.priceSubLabel}>BankNifty Index Spot</Text>
               <Text style={styles.livePriceText}>
                 {livePrice ? `₹${livePrice.toLocaleString('en-IN')}` : 'Waiting for tick...'}
               </Text>
            </View>
          )}

          {/* Signals Stream */}
          <Text style={styles.sectionHeading}>Live Signals Stream</Text>
          {signals.length === 0 ? (
            <Text style={styles.emptyText}>No signals yet. Connect to the server to listen.</Text>
          ) : (
            signals.map((sig, index) => (
              <View key={index} style={styles.signalCard(sig.signal)}>
                <View style={styles.signalHeader}>
                  <Text style={styles.signalDirection(sig.signal)}>{sig.signal}</Text>
                  <Text style={styles.signalScore}>{sig.checklistScore}/7 Score</Text>
                </View>
                <Text style={styles.signalReasoning}>{sig.reasoning}</Text>
                
                {sig.entry && (
                  <View style={styles.targetRow}>
                    <View style={styles.targetCol}>
                      <Text style={styles.targetLabel}>Entry</Text>
                      <Text style={styles.targetValue}>₹{sig.entry.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={styles.targetCol}>
                      <Text style={styles.targetLabel}>Target</Text>
                      <Text style={styles.targetValue}>₹{sig.target.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={styles.targetCol}>
                      <Text style={styles.targetLabel}>Stop Loss</Text>
                      <Text style={[styles.targetValue, {color: '#FF4D4D'}]}>₹{sig.stopLoss.toLocaleString('en-IN')}</Text>
                    </View>
                  </View>
                )}
                <Text style={styles.timestamp}>
                  {new Date(sig.timestamp).toLocaleTimeString()} • {sig.triggeringLevel}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0C14' },
  flex1: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 50 : 20, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: '#1A1D27'
  },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  statusBadge: (live) => ({
    backgroundColor: live ? 'rgba(0, 216, 74, 0.15)' : 'rgba(255, 77, 77, 0.15)',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1,
    borderColor: live ? '#00D84A' : '#FF4D4D'
  }),
  statusText: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  card: {
    backgroundColor: '#1E2230', borderRadius: 16, padding: 20, marginBottom: 20,
    borderWidth: 1, borderColor: '#2A2E3D',
  },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 20 },
  label: { color: '#8892B0', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: '700' },
  input: {
    backgroundColor: '#12141C', color: '#FFF', borderRadius: 10, padding: 14,
    fontSize: 14, marginBottom: 20, borderWidth: 1, borderColor: '#2A2E3D'
  },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  switchLabel: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  priceDataContainer: { alignItems: 'center', marginVertical: 10, paddingBottom: 20 },
  priceSubLabel: { color: '#8892B0', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2 },
  livePriceText: { color: '#FFF', fontSize: 48, fontWeight: '900', letterSpacing: -1, marginTop: 4 },
  sectionHeading: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 16, marginTop: 10 },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
  signalCard: (signalType) => ({
    backgroundColor: '#1E2230', borderRadius: 16, padding: 20, marginBottom: 16,
    borderLeftWidth: 4, borderLeftColor: signalType === 'BUY' ? '#00D84A' : signalType === 'SELL' ? '#FF4D4D' : '#FFC107'
  }),
  signalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  signalDirection: (type) => ({
    color: type === 'BUY' ? '#00D84A' : type === 'SELL' ? '#FF4D4D' : '#FFC107',
    fontSize: 22, fontWeight: '900', letterSpacing: 2
  }),
  signalScore: { color: '#00D84A', fontSize: 13, fontWeight: 'bold', backgroundColor: 'rgba(0,216,74,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  signalReasoning: { color: '#A0ADC0', fontSize: 14, lineHeight: 22, marginBottom: 16 },
  targetRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#12141C', borderRadius: 12, padding: 14, marginBottom: 16 },
  targetCol: { alignItems: 'center' },
  targetLabel: { color: '#8892B0', fontSize: 10, textTransform: 'uppercase', marginBottom: 6, fontWeight: '800' },
  targetValue: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  timestamp: { color: '#666', fontSize: 11, textAlign: 'right', fontWeight: '500' }
});
