#property strict
#property version   "1.00"
#property description "IU Liquidity Sweep EA for S1 charts"

#include <Trade/Trade.mqh>

input int      InpSwingLength        = 50;
input int      InpMaxBullZones       = 5;
input int      InpMaxBearZones       = 5;
input double   InpLots               = 0.10;
input double   InpTakeProfitPercent  = 0.10;
input bool     InpCloseOnOpposite    = true;
input ulong    InpMagicNumber        = 20260322;

struct LiquidityZone
{
   double   top;
   double   bottom;
   datetime pivotTime;
};

CTrade trade;

LiquidityZone bullZones[];
LiquidityZone bearZones[];

datetime lastProcessedBarTime = 0;
datetime lastBullPivotTime    = 0;
datetime lastBearPivotTime    = 0;

int OnInit()
{
   trade.SetExpertMagicNumber(InpMagicNumber);
   ArrayResize(bullZones, 0);
   ArrayResize(bearZones, 0);
   lastProcessedBarTime = iTime(_Symbol, _Period, 0);

   if(PeriodSeconds(_Period) != 1)
   {
      Print("Warning: This EA is intended for 1-second charts. Current period seconds = ", PeriodSeconds(_Period));
   }

   return(INIT_SUCCEEDED);
}

void OnTick()
{
   datetime currentBarTime = iTime(_Symbol, _Period, 0);
   if(currentBarTime == 0 || currentBarTime == lastProcessedBarTime)
      return;

   lastProcessedBarTime = currentBarTime;
   ProcessClosedBar();
}

void ProcessClosedBar()
{
   const int pivotShift = InpSwingLength + 1;
   const int barsNeeded = (InpSwingLength * 2) + 5;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, _Period, 0, barsNeeded, rates);
   if(copied < (pivotShift + InpSwingLength + 1))
      return;

   if(IsPivotHigh(rates, pivotShift, InpSwingLength))
   {
      datetime pivotTime = rates[pivotShift].time;
      if(pivotTime != lastBearPivotTime)
      {
         double bodyTop = MathMax(rates[pivotShift].open, rates[pivotShift].close);
         AddBearZone(rates[pivotShift].high, bodyTop, pivotTime);
         lastBearPivotTime = pivotTime;
      }
   }

   if(IsPivotLow(rates, pivotShift, InpSwingLength))
   {
      datetime pivotTime = rates[pivotShift].time;
      if(pivotTime != lastBullPivotTime)
      {
         double bodyBottom = MathMin(rates[pivotShift].open, rates[pivotShift].close);
         AddBullZone(bodyBottom, rates[pivotShift].low, pivotTime);
         lastBullPivotTime = pivotTime;
      }
   }

   const double close1 = rates[1].close;
   const double high1  = rates[1].high;
   const double low1   = rates[1].low;

   bool insideBullZone = false;
   bool insideBearZone = false;
   bool bullBounce     = false;
   bool bearBounce     = false;

   for(int i = ArraySize(bullZones) - 1; i >= 0; --i)
   {
      if(close1 > bullZones[i].bottom && close1 < bullZones[i].top)
         insideBullZone = true;

      if(close1 > bullZones[i].bottom && low1 < bullZones[i].bottom)
         bullBounce = true;

      if(close1 < bullZones[i].bottom)
         RemoveZoneAt(bullZones, i);
   }

   for(int i = ArraySize(bearZones) - 1; i >= 0; --i)
   {
      if(close1 > bearZones[i].bottom && close1 < bearZones[i].top)
         insideBearZone = true;

      if(close1 < bearZones[i].top && high1 > bearZones[i].top)
         bearBounce = true;

      if(close1 > bearZones[i].top)
         RemoveZoneAt(bearZones, i);
   }

   Comment(
      "IU Sweep EA\n",
      "Bull zones: ", ArraySize(bullZones), "\n",
      "Bear zones: ", ArraySize(bearZones), "\n",
      "Inside bull zone: ", insideBullZone ? "true" : "false", "\n",
      "Inside bear zone: ", insideBearZone ? "true" : "false", "\n",
      "Bull bounce: ", bullBounce ? "true" : "false", "\n",
      "Bear bounce: ", bearBounce ? "true" : "false"
   );

   if(bullBounce && !bearBounce)
      ExecuteLong();
   else if(bearBounce && !bullBounce)
      ExecuteShort();
}

bool IsPivotHigh(MqlRates &rates[], const int pivotShift, const int length)
{
   if(ArraySize(rates) <= pivotShift + length || pivotShift - length < 1)
      return false;

   const double pivotHigh = rates[pivotShift].high;

   for(int i = pivotShift - length; i <= pivotShift + length; ++i)
   {
      if(i == pivotShift)
         continue;

      if(rates[i].high >= pivotHigh)
         return false;
   }

   return true;
}

bool IsPivotLow(MqlRates &rates[], const int pivotShift, const int length)
{
   if(ArraySize(rates) <= pivotShift + length || pivotShift - length < 1)
      return false;

   const double pivotLow = rates[pivotShift].low;

   for(int i = pivotShift - length; i <= pivotShift + length; ++i)
   {
      if(i == pivotShift)
         continue;

      if(rates[i].low <= pivotLow)
         return false;
   }

   return true;
}

void AddBullZone(double top, double bottom, datetime pivotTime)
{
   LiquidityZone zone;
   zone.top = MathMax(top, bottom);
   zone.bottom = MathMin(top, bottom);
   zone.pivotTime = pivotTime;
   PushZoneWithCap(bullZones, zone, InpMaxBullZones);
}

void AddBearZone(double top, double bottom, datetime pivotTime)
{
   LiquidityZone zone;
   zone.top = MathMax(top, bottom);
   zone.bottom = MathMin(top, bottom);
   zone.pivotTime = pivotTime;
   PushZoneWithCap(bearZones, zone, InpMaxBearZones);
}

void PushZoneWithCap(LiquidityZone &zones[], LiquidityZone &zone, const int maxCount)
{
   int size = ArraySize(zones);
   ArrayResize(zones, size + 1);
   zones[size] = zone;

   if(ArraySize(zones) > maxCount)
      RemoveZoneAt(zones, 0);
}

void RemoveZoneAt(LiquidityZone &zones[], const int index)
{
   const int size = ArraySize(zones);
   if(index < 0 || index >= size)
      return;

   for(int i = index; i < size - 1; ++i)
      zones[i] = zones[i + 1];

   ArrayResize(zones, size - 1);
}

int CountPositionsByType(const ENUM_POSITION_TYPE type)
{
   int count = 0;

   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;

      if(!PositionSelectByTicket(ticket))
         continue;

      if(PositionGetString(POSITION_SYMBOL) != _Symbol)
         continue;

      if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagicNumber)
         continue;

      if((ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE) == type)
         count++;
   }

   return count;
}

void ClosePositionsByType(const ENUM_POSITION_TYPE type)
{
   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;

      if(!PositionSelectByTicket(ticket))
         continue;

      if(PositionGetString(POSITION_SYMBOL) != _Symbol)
         continue;

      if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagicNumber)
         continue;

      if((ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE) != type)
         continue;

      trade.PositionClose(ticket);
   }
}

void ExecuteLong()
{
   if(InpCloseOnOpposite)
      ClosePositionsByType(POSITION_TYPE_SELL);

   if(CountPositionsByType(POSITION_TYPE_BUY) > 0)
      return;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return;

   const double entry = tick.ask;
   const double tp = NormalizeDouble(entry * (1.0 + (InpTakeProfitPercent / 100.0)), _Digits);

   trade.Buy(InpLots, _Symbol, 0.0, 0.0, tp, "IU Sweep Buy");
}

void ExecuteShort()
{
   if(InpCloseOnOpposite)
      ClosePositionsByType(POSITION_TYPE_BUY);

   if(CountPositionsByType(POSITION_TYPE_SELL) > 0)
      return;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return;

   const double entry = tick.bid;
   const double tp = NormalizeDouble(entry * (1.0 - (InpTakeProfitPercent / 100.0)), _Digits);

   trade.Sell(InpLots, _Symbol, 0.0, 0.0, tp, "IU Sweep Sell");
}
