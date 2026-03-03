import re

fp = 'src/pages/GoogleAdsBanner.tsx'
with open(fp) as f:
    L = f.readlines()
print(f'Original: {len(L)} lines')

# 1. Fix imports - remove ChevronDown, ChevronUp
L[3] = "import { Upload, Shield, Clock, Star, CheckCircle, Truck, Users, FileCheck, X, Loader2, ArrowRight, Brush, Minus, Plus, Lock, Mail, Droplets, Sun, Wind, Palette, Tag, Move, ZoomIn, ZoomOut } from 'lucide-react';\n"
print('1 done')