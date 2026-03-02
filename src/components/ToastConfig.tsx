import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Toast, { BaseToast, BaseToastProps, ErrorToast } from 'react-native-toast-message';

// 自定义成功 Toast
const SuccessToastComponent = (props: BaseToastProps) => (
  <BaseToast
    {...props}
    style={styles.successToast}
    contentContainerStyle={styles.contentContainer}
    text1Style={styles.text1}
    text2Style={styles.text2}
    renderLeadingIcon={() => (
      <View style={styles.iconContainer}>
        <Feather name="check" size={20} color={styles.successIcon.color} />
      </View>
    )}
  />
);

// 自定义错误 Toast
const ErrorToastComponent = (props: BaseToastProps) => (
  <ErrorToast
    {...props}
    style={styles.errorToast}
    contentContainerStyle={styles.contentContainer}
    text1Style={styles.text1}
    text2Style={styles.text2}
    renderLeadingIcon={() => (
      <View style={styles.iconContainer}>
        <Feather name="x" size={20} color={styles.errorIcon.color} />
      </View>
    )}
  />
);

// 自定义信息 Toast
const InfoToastComponent = (props: BaseToastProps) => (
  <BaseToast
    {...props}
    style={styles.infoToast}
    contentContainerStyle={styles.contentContainer}
    text1Style={styles.text1}
    text2Style={styles.text2}
    renderLeadingIcon={() => (
      <View style={styles.iconContainer}>
        <Feather name="info" size={20} color={styles.infoIcon.color} />
      </View>
    )}
  />
);

// Toast 配置
export const toastConfig = {
  success: SuccessToastComponent,
  error: ErrorToastComponent,
  info: InfoToastComponent,
};

// 便捷函数
export const showToast = {
  success: (text1: string, text2?: string) => {
    Toast.show({
      type: 'success',
      text1,
      text2,
      position: 'top',
      visibilityTime: 3000,
      autoHide: true,
      topOffset: 50,
      bottomOffset: 100,
    });
  },
  error: (text1: string, text2?: string) => {
    Toast.show({
      type: 'error',
      text1,
      text2,
      position: 'top',
      visibilityTime: 4000,
      autoHide: true,
      topOffset: 50,
      bottomOffset: 100,
    });
  },
  info: (text1: string, text2?: string) => {
    Toast.show({
      type: 'info',
      text1,
      text2,
      position: 'top',
      visibilityTime: 3000,
      autoHide: true,
      topOffset: 50,
      bottomOffset: 100,
    });
  },
};

const styles = StyleSheet.create({
  successToast: {
    borderLeftColor: '#10B981',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  errorToast: {
    borderLeftColor: '#EF4444',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  infoToast: {
    borderLeftColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  text1: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  text2: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  successIcon: {
    fontSize: 20,
    color: '#10B981',
    fontWeight: 'bold',
  },
  errorIcon: {
    fontSize: 20,
    color: '#EF4444',
    fontWeight: 'bold',
  },
  infoIcon: {
    fontSize: 20,
    color: '#3B82F6',
    fontWeight: 'bold',
  },
});

export default Toast;
